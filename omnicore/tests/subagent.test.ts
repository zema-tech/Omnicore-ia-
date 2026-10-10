// Test secondario: agents.run delega file-work isolato al code agent.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agents } from "../src/modules/agents.ts";
import { runTool } from "../src/agent/tools.ts";
import { verifyLocal } from "../src/decide/rules.ts";

let dir = "";
let ws = "";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ["OMNICORE_AGENTS_FILE", "OMNICORE_WORKSPACE"]) saved[k] = process.env[k];
  dir = mkdtempSync(join(tmpdir(), "subagent-test-"));
  ws = mkdtempSync(join(tmpdir(), "subagent-ws-"));
  process.env["OMNICORE_AGENTS_FILE"] = join(dir, "agents.json");
  process.env["OMNICORE_WORKSPACE"] = ws;
});

afterEach(() => {
  for (const k of ["OMNICORE_AGENTS_FILE", "OMNICORE_WORKSPACE"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
  rmSync(ws, { recursive: true, force: true });
});

describe("agents.run", () => {
  it("senza conferma: proposto, non eseguito", async () => {
    agents.register("filebot", []);
    const r = await runTool({ name: "agents.run", args: { name: "filebot", task: "crea x.txt con ciao" } });
    assert.equal(r.ok, false);
    assert.equal(r.needsConfirm, true);
  });
  it("agente sconosciuto o in pausa: errore onesto", async () => {
    const u = await runTool({ name: "agents.run", args: { name: "fantasma", task: "x", confirm: true } });
    assert.equal(u.ok, false);
    assert.match(u.error!, /non registrato/);
    agents.register("pausato", []);
    agents.pause("pausato");
    const p = await runTool({ name: "agents.run", args: { name: "pausato", task: "x", confirm: true } });
    assert.equal(p.ok, false);
    assert.match(p.error!, /pausa/);
  });
  it("confermato: esegue code.task isolato e riporta task_result", async () => {
    agents.register("filebot", ["riepilogo"]);
    const r = await runTool(
      { name: "agents.run", args: { name: "filebot", task: "crea nota.txt con contenuto ciao mondo", confirm: true } },
      { directory: ws },
    );
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
    assert.equal((r.data as any).agent, "filebot");
    assert.ok(((r.data as any).filesTouched as string[]).includes("nota.txt"));
    assert.ok(((r.data as any).report as string).includes("<task_result"));
    assert.ok(existsSync(join(ws, "nota.txt")));
  });
  it("decide: review senza conferma, allow con conferma", () => {
    const call = { name: "agents.run" as const, args: { name: "a", task: "t" } };
    assert.equal(verifyLocal(call, {}).verdict, "review");
    assert.equal(verifyLocal(call, { confirm: true }).verdict, "allow");
  });
});
