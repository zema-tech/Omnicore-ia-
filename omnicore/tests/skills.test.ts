// Test skill create: il principale crea skill riusabili (stile Hermes curator).
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { skills } from "../src/modules/skills.ts";
import { runTool } from "../src/agent/tools.ts";
import { verifyLocal } from "../src/decide/rules.ts";
import { runAgent } from "../src/agent/loop.ts";

let dir = "";
let savedSkills: string | undefined;
const ENV_KEYS = ["OMNICORE_LLM_BASE_URL", "OMNICORE_LLM_API_KEY", "OMNICORE_LLM_MODEL",
  "OMNICORE_LLM_PROVIDER", "OMNICORE_LLM_LOCAL_MODEL", "OLLAMA_HOST", "OMNICORE_LLM_TIMEOUT"];
let savedEnv: Record<string, string | undefined> = {};
let fake: Server | null = null;

beforeEach(() => {
  savedSkills = process.env["OMNICORE_SKILLS_DIR"];
  dir = mkdtempSync(join(tmpdir(), "skills-test-"));
  process.env["OMNICORE_SKILLS_DIR"] = dir;
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(async () => {
  if (savedSkills === undefined) delete process.env["OMNICORE_SKILLS_DIR"];
  else process.env["OMNICORE_SKILLS_DIR"] = savedSkills;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(dir, { recursive: true, force: true });
  if (fake) {
    await new Promise<void>((res) => fake!.close(() => res()));
    fake = null;
  }
});

const LONG = "Quando l'utente chiede un riepilogo, leggi gli ultimi messaggi e sintetizza in tre punti.";

describe("skills.create", () => {
  it("crea SKILL.md con frontmatter, poi list/get/search la trovano", () => {
    const c = skills.create("mio-riepilogo", "Riepiloga conversazioni", LONG);
    assert.equal(c.name, "mio-riepilogo");
    assert.ok(existsSync(c.path));
    const body = readFileSync(c.path, "utf8");
    assert.ok(body.startsWith("---\nname: mio-riepilogo\n"));
    assert.ok(skills.get("mio-riepilogo") !== null);
    assert.ok(skills.search("riepiloga conversazioni").some((s) => s.name === "mio-riepilogo"));
  });
  it("rifiuta nome invalido, description vuota, istruzioni corte, duplicati", () => {
    assert.throws(() => skills.create("Nome Sbagliato!!", "d", LONG));
    assert.throws(() => skills.create("ok-nome", "", LONG));
    assert.throws(() => skills.create("ok-nome", "desc", "corta"));
    skills.create("doppia", "desc doppia", LONG);
    assert.throws(() => skills.create("doppia", "desc doppia", LONG));
  });
});

describe("skills.create nel loop", () => {
  it("tool senza conferma: chiede conferma, non scrive", async () => {
    const r = await runTool({ name: "skills.create", args: { name: "x", description: "d", instructions: LONG } });
    assert.equal(r.ok, false);
    assert.equal(r.needsConfirm, true);
    assert.equal(skills.list().length, 0);
  });
  it("decide: senza conferma review, con conferma allow", () => {
    const call = { name: "skills.create" as const, args: { name: "x" } };
    assert.equal(verifyLocal(call, {}).verdict, "review");
    assert.equal(verifyLocal(call, { confirm: true }).verdict, "allow");
  });
  it("'confermo: crea skill' con LLM: crea davvero", async () => {
    const script = [
      '[{"name":"skills.create","args":{"name":"prova-loop","description":"skill di prova","instructions":"' + LONG + '"}}]',
      '[]',
      'SKILL CREATA E PRONTA',
    ];
    let n = 0;
    fake = createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: script[Math.min(n++, script.length - 1)] } }] }));
    });
    await new Promise<void>((res) => fake!.listen(0, "127.0.0.1", () => res()));
    process.env["OMNICORE_LLM_BASE_URL"] = `http://127.0.0.1:${(fake!.address() as any).port}`;
    process.env["OMNICORE_LLM_MODEL"] = "finto";
    process.env["OMNICORE_LLM_TIMEOUT"] = "3000";
    process.env["OLLAMA_HOST"] = "http://127.0.0.1:1";
    const r = await runAgent("confermo: crea la skill prova-loop per i riepiloghi");
    assert.equal(r.planner, "llm");
    const created = r.trace.find((t) => t.name === "skills.create");
    assert.ok(created && created.ok, `trace: ${JSON.stringify(r.trace.map((t) => [t.name, t.ok, t.error]))}`);
    assert.ok(existsSync(join(dir, "prova-loop", "SKILL.md")));
    assert.equal(r.reply, "SKILL CREATA E PRONTA");
  });
});
