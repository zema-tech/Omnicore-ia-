// Test curator skill: audit, prune, compose + gate nel loop.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { skills } from "../src/modules/skills.ts";
import { runTool } from "../src/agent/tools.ts";
import { verifyLocal } from "../src/decide/rules.ts";

let dir = "";
let saved: string | undefined;
const LONG = "Istruzioni operative lunghe a sufficienza per passare ogni validazione del modulo senza problemi di brevità.";

function seed(name: string, desc: string, body: string = LONG): void {
  skills.create(name, desc, body);
}

beforeEach(() => {
  saved = process.env["OMNICORE_SKILLS_DIR"];
  dir = mkdtempSync(join(tmpdir(), "curator-test-"));
  process.env["OMNICORE_SKILLS_DIR"] = dir;
});

afterEach(() => {
  if (saved === undefined) delete process.env["OMNICORE_SKILLS_DIR"];
  else process.env["OMNICORE_SKILLS_DIR"] = saved;
  rmSync(dir, { recursive: true, force: true });
});

describe("skills curator", () => {
  it("audit trova overlap funzionali", () => {
    seed("riepilogo-chat", "Riepilogo conversazioni chat con messaggi");
    seed("riepilogo-discussioni", "Riassunto conversazioni chat con messaggi");
    const r = skills.audit();
    assert.equal(r.total, 2);
    assert.ok(r.issues.some((i) => i.kind === "overlap"), JSON.stringify(r.issues));
  });
  it("audit segnala esili e stantie", () => {
    seed("normale", "Skill normale e completa");
    seed("esile", "Skill con corpo corto", "Corpo appena sopra il minimo di venti caratteri.");
    const old = join(dir, "esile", "SKILL.md");
    utimesSync(old, new Date("2020-01-01"), new Date("2020-01-01"));
    const r = skills.audit();
    assert.ok(r.issues.some((i) => i.kind === "thin" && i.skill === "esile"));
    assert.ok(r.issues.some((i) => i.kind === "stale" && i.skill === "esile"));
  });
  it("prune elimina, ignota assente", () => {
    seed("cancella-mi", "Da potare");
    assert.deepEqual(skills.prune("cancella-mi"), { pruned: "cancella-mi" });
    assert.ok(!existsSync(join(dir, "cancella-mi")));
    assert.throws(() => skills.prune("fantasma"));
  });
  it("compose unisce esistenti, rifiuta assenti o poche", () => {
    seed("parte-a", "Prima parte del flusso");
    seed("parte-b", "Seconda parte del flusso");
    const c = skills.compose("flusso-ab", "Flusso completo a-b", ["parte-a", "parte-b"]);
    const got = skills.get("flusso-ab")!;
    assert.ok(got.instructions.includes("parte-a") && got.instructions.includes("parte-b"));
    assert.ok(existsSync(c.path));
    assert.throws(() => skills.compose("x", "d", ["parte-a", "fantasma"]));
    assert.throws(() => skills.compose("y", "d", ["parte-a"]));
  });
});

describe("curator nel loop", () => {
  it("audit via tool, prune/compose chiedono conferma", async () => {
    seed("solo-audit", "Audit di prova completo");
    const a = await runTool({ name: "skills.audit", args: {} });
    assert.equal(a.ok, true);
    assert.equal((a.data as any).total, 1);
    const p = await runTool({ name: "skills.prune", args: { name: "solo-audit" } });
    assert.equal(p.needsConfirm, true);
    assert.ok(existsSync(join(dir, "solo-audit")));
    const pc = await runTool({ name: "skills.prune", args: { name: "solo-audit", confirm: true } });
    assert.equal(pc.ok, true);
    assert.ok(!existsSync(join(dir, "solo-audit")));
    assert.equal(verifyLocal({ name: "skills.compose" as const, args: {} }, {}).verdict, "review");
  });
});
