// Test workboard: coda, priorità, dipendenze, handoff, monitor, tool.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { board } from "../src/modules/workboard.ts";
import { runTool } from "../src/agent/tools.ts";

let dir = "";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env["OMNICORE_BOARD_FILE"];
  dir = mkdtempSync(join(tmpdir(), "board-test-"));
  process.env["OMNICORE_BOARD_FILE"] = join(dir, "board.json");
});

afterEach(() => {
  if (saved === undefined) delete process.env["OMNICORE_BOARD_FILE"];
  else process.env["OMNICORE_BOARD_FILE"] = saved;
  rmSync(dir, { recursive: true, force: true });
});

describe("workboard", () => {
  it("priorità: claim prende il più urgente", () => {
    board.add("bassa", { priority: 1 });
    const alta = board.add("alta", { priority: 9 });
    const c = board.claim("bot1")!;
    assert.equal(c.id, alta.id);
    assert.equal(c.owner, "bot1");
  });
  it("dipendenze bloccano finché non done", () => {
    const a = board.add("prima");
    const b = board.add("seconda", { dependsOn: [a.id] });
    const c1 = board.claim("bot")!;
    assert.equal(c1.id, a.id);
    assert.equal(board.claim("bot2"), null);
    board.done(a.id, true, "fatto");
    const c2 = board.claim("bot2")!;
    assert.equal(c2.id, b.id);
    const st = board.status();
    assert.equal(st.counts.done, 1);
    assert.deepEqual(st.blocked, []);
  });
  it("handoff cambia owner con contesto, mai a sé stesso", () => {
    const a = board.add("passami");
    board.claim("alice");
    const h = board.handoff(a.id, "alice", "bob", "metà fatta, continua dai test");
    assert.equal(h.owner, "bob");
    assert.equal(h.handoffs.length, 1);
    assert.throws(() => board.handoff(a.id, "bob", "bob", "x"));
  });
  it("errori onesti: titolo vuoto, dipendenza assente, done senza running", () => {
    assert.throws(() => board.add("  "));
    assert.throws(() => board.add("x", { dependsOn: ["nope"] }));
    const a = board.add("ferma");
    assert.throws(() => board.done(a.id, true));
    assert.throws(() => board.claim(""));
  });
});

describe("board nei tool", () => {
  it("flusso via tool", async () => {
    const a = await runTool({ name: "board.add", args: { title: "via tool", priority: 7 } });
    assert.equal(a.ok, true);
    const l = await runTool({ name: "board.list", args: {} });
    assert.equal((l.data as any[]).length, 1);
    const c = await runTool({ name: "board.claim", args: { owner: "bot" } });
    assert.equal(c.ok, true);
    const h = await runTool({ name: "board.handoff", args: { id: (a.data as any).id, from: "bot", to: "bot2" } });
    assert.equal(h.ok, true);
    const d = await runTool({ name: "board.done", args: { id: (a.data as any).id, ok: true, result: "ok" } });
    assert.equal(d.ok, true);
    const s = await runTool({ name: "board.status", args: {} });
    assert.equal((s.data as any).counts.done, 1);
  });
});
