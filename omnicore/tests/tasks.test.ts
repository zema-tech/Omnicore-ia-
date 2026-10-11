// Test long-running: schedule, slice con checkpoint, resume, finish, gate.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tasks } from "../src/modules/tasks.ts";
import { runTool } from "../src/agent/tools.ts";

let dir = "";
let ws = "";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ["OMNICORE_TASKS_FILE", "OMNICORE_WORKSPACE"]) saved[k] = process.env[k];
  dir = mkdtempSync(join(tmpdir(), "tasks-test-"));
  ws = mkdtempSync(join(tmpdir(), "tasks-ws-"));
  process.env["OMNICORE_TASKS_FILE"] = join(dir, "tasks.json");
  process.env["OMNICORE_WORKSPACE"] = ws;
});

afterEach(() => {
  for (const k of ["OMNICORE_TASKS_FILE", "OMNICORE_WORKSPACE"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
  rmSync(ws, { recursive: true, force: true });
});

describe("tasks long-running", () => {
  it("schedule valida, run futuro rifiutato", () => {
    assert.throws(() => tasks.schedule("  "));
    assert.throws(() => tasks.schedule("x", { runAt: "non-data" }));
    const t = tasks.schedule("scrivi report", { runAt: new Date(Date.now() + 3600_000).toISOString() });
    assert.equal(t.status, "scheduled");
  });
  it("run → checkpoint → resume → finish", async () => {
    const t = tasks.schedule("crea appunti.txt con contenuto ciao");
    const r1 = await tasks.slice(t.id, { workspace: ws });
    assert.equal(r1.ok, true, r1.error ?? "");
    assert.equal(r1.slice, 1);
    assert.ok(existsSync(join(ws, "appunti.txt")));
    const mid = tasks.status(t.id);
    assert.equal(mid.checkpoint.slices, 1);
    assert.ok(mid.checkpoint.files.includes("appunti.txt"));
    const r2 = await tasks.slice(t.id, { workspace: ws });
    assert.equal(r2.slice, 2);
    const done = tasks.finish(t.id, true, "verificato");
    assert.equal(done.status, "done");
    assert.match(done.checkpoint.summary, /Finale/);
  });
  it("run futuro onesto, terminali protetti", async () => {
    const t = tasks.schedule("dopo", { runAt: new Date(Date.now() + 3600_000).toISOString() });
    const r = await tasks.slice(t.id, { workspace: ws });
    assert.equal(r.ok, false);
    assert.match(r.error!, /non ancora dovuto/);
    tasks.cancel(t.id);
    assert.equal(tasks.status(t.id).status, "cancelled");
    assert.throws(() => tasks.finish(t.id, true));
  });
});

describe("tasks nei tool", () => {
  it("run senza conferma proposto; flusso via tool", async () => {
    const s = await runTool({ name: "task.schedule", args: { goal: "crea t.txt con ciao" } });
    assert.equal(s.ok, true);
    const id = (s.data as any).id;
    const p = await runTool({ name: "task.run", args: { id } });
    assert.equal(p.needsConfirm, true);
    const r = await runTool({ name: "task.run", args: { id, confirm: true } }, { directory: ws });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
    const f = await runTool({ name: "task.finish", args: { id, ok: true } });
    assert.equal(f.ok, true);
    const l = await runTool({ name: "task.list", args: { status: "done" } });
    assert.equal((l.data as any[]).length, 1);
  });
});
