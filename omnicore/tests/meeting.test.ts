// Test meeting live: start/append/status/end + vault + tool.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { meeting } from "../src/modules/meeting.ts";
import { runTool } from "../src/agent/tools.ts";

let dir = "";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ["OMNICORE_MEETINGS_FILE", "OMNICORE_VAULT_DIR"]) saved[k] = process.env[k];
  dir = mkdtempSync(join(tmpdir(), "meeting-test-"));
  process.env["OMNICORE_MEETINGS_FILE"] = join(dir, "meetings.json");
  process.env["OMNICORE_VAULT_DIR"] = join(dir, "vault");
});

afterEach(() => {
  for (const k of ["OMNICORE_MEETINGS_FILE", "OMNICORE_VAULT_DIR"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("meeting live", () => {
  it("flusso completo con action item e archivio", () => {
    const { id } = meeting.start("Sprint review", ["ana", "zem"]);
    assert.ok(id.startsWith("mtg-"));
    const a1 = meeting.append(id, "ana", "Abbiamo deciso di rilasciare venerdì");
    assert.equal(a1.action, true);
    meeting.append(id, "zem", "Il meteo è bello oggi");
    const st = meeting.status(id);
    assert.ok(st.markdown.includes("## Timeline"));
    assert.ok(st.markdown.includes("[00:00]"));
    const end = meeting.end(id);
    assert.ok(end.markdown.includes("## Action item"));
    assert.ok(end.markdown.includes("rilasciare venerdì"));
    assert.ok(end.file && existsSync(end.file));
    assert.ok(readdirSync(join(dir, "vault")).length >= 1);
    assert.deepEqual(meeting.list(), []);
  });
  it("errori onesti: titolo vuoto, id ignoto, doppia chiusura", () => {
    assert.throws(() => meeting.start("  "));
    assert.throws(() => meeting.append("nope", "x", "y"));
    const { id } = meeting.start("Breve");
    meeting.end(id);
    assert.throws(() => meeting.end(id));
    assert.throws(() => meeting.append(id, "x", "tardi"));
  });
  it("tool nel loop", async () => {
    const s = await runTool({ name: "meeting.start", args: { title: "Sync" } });
    assert.equal(s.ok, true);
    const id = (s.data as any).id;
    const a = await runTool({ name: "meeting.append", args: { id, who: "io", text: "TODO: scrivere report" } });
    assert.equal((a.data as any).action, true);
    const e = await runTool({ name: "meeting.end", args: { id } });
    assert.equal(e.ok, true);
    assert.ok(String((e.data as any).markdown).includes("TODO"));
  });
});
