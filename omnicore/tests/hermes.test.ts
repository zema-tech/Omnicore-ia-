// Test fusione Hermes: sessioni native, permessi, skills.
// Stato isolato via OMNICORE_*_FILE / OMNICORE_SKILLS_DIR temporanei.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession, logMessage, readMessages, listSessions } from "../src/modules/sessions.ts";
import { approvalRequest, approvalsOpen, approvalRespond } from "../src/modules/permissions.ts";
import { listSkills, getSkill, searchSkills } from "../src/modules/skills.ts";
import { runTool } from "../src/agent/tools.ts";

let dir = "";
let saved: Record<string, string | undefined> = {};
const KEYS = ["OMNICORE_SESSIONS_FILE", "OMNICORE_APPROVALS_FILE", "OMNICORE_SKILLS_DIR"];

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), "hermes-test-"));
  process.env["OMNICORE_SESSIONS_FILE"] = join(dir, "sessions.json");
  process.env["OMNICORE_APPROVALS_FILE"] = join(dir, "approvals.json");
  const sk = join(dir, "skills", "prova");
  mkdirSync(sk, { recursive: true });
  writeFileSync(join(sk, "SKILL.md"), "---\nname: prova\ndescription: skill di prova per i test\n---\nIstruzioni di prova.");
  writeFileSync(join(dir, "skills", "rotta.md"), "senza frontmatter ma valida");
  process.env["OMNICORE_SKILLS_DIR"] = join(dir, "skills");
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("sessions", () => {
  it("create + log + read + list", () => {
    const id = createSession();
    logMessage(id, { text: "ciao mondo" });
    logMessage(id, { text: "secondo" });
    assert.equal(readMessages(id).length, 2);
    assert.equal(readMessages(id, 1)[0].text, "secondo");
    const list = listSessions();
    assert.equal(list.length, 1);
    assert.equal(list[0].count, 2);
  });
  it("log su id assente crea la sessione", () => {
    const id = logMessage("s-inesistente", { text: "x" });
    assert.ok(id.length > 0);
    assert.equal(readMessages(id).length, 1);
  });
  it("sessione assente -> []", () => {
    assert.deepEqual(readMessages("nope"), []);
  });
});

describe("permissions", () => {
  it("request -> open -> respond allow", () => {
    const r = approvalRequest("code.shell", "rm -rf /tmp/x", "pulizia");
    assert.equal(r.status, "open");
    assert.equal(approvalsOpen().length, 1);
    assert.equal(approvalRespond(r.id, true), true);
    assert.equal(approvalsOpen().length, 0);
    assert.equal(approvalRespond(r.id, true), false); // già decisa
  });
  it("senza action/target rifiuta", () => {
    assert.throws(() => approvalRequest("", "x"));
    assert.equal(approvalRespond("inesistente", true), false);
  });
});

describe("skills", () => {
  it("list/get/search", () => {
    const all = listSkills();
    assert.ok(all.some((s) => s.name === "prova"));
    assert.equal(getSkill("prova")?.description, "skill di prova per i test");
    assert.equal(getSkill("fantasma"), null);
    assert.ok(searchSkills("prova test").some((s) => s.name === "prova"));
    assert.deepEqual(searchSkills("zzz-niente"), []);
  });
});

describe("tools hermes", () => {
  it("permissions.request/respond via tool", async () => {
    const q = await runTool({ name: "permissions.request", args: { action: "a", target: "t" } });
    assert.equal(q.ok, true);
    const id = (q.data as any).id;
    const r = await runTool({ name: "permissions.respond", args: { id, allow: false } });
    assert.equal(r.ok, true);
  });
  it("skills.list via tool", async () => {
    const r = await runTool({ name: "skills.list", args: {} });
    assert.equal(r.ok, true);
    assert.ok((r.data as any[]).some((s) => s.name === "prova"));
  });
});
