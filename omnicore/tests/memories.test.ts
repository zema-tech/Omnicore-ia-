// Test memoria strutturata: SQLite+FTS5, BM25, forget, coseno, tool.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memories, memStore, memRecall, memForget, memCount, memClose, cosine } from "../src/modules/memories.ts";
import { runTool } from "../src/agent/tools.ts";
import { memory } from "../src/faculties/memory.ts";

let dir = "";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env["OMNICORE_MEMORIES_FILE"];
  dir = mkdtempSync(join(tmpdir(), "memories-test-"));
  process.env["OMNICORE_MEMORIES_FILE"] = join(dir, "m.sqlite");
});

afterEach(() => {
  memClose();
  if (saved === undefined) delete process.env["OMNICORE_MEMORIES_FILE"];
  else process.env["OMNICORE_MEMORIES_FILE"] = saved;
  rmSync(dir, { recursive: true, force: true });
});

describe("memories store/recall", () => {
  it("BM25 ordina per rilevanza", () => {
    memStore("il gatto dorme sul divano rosso");
    memStore("il cane abbaia in giardino di notte");
    const hits = memRecall("gatto divano");
    assert.ok(hits.length >= 1);
    assert.match(hits[0].content, /gatto/);
    assert.equal(memCount(), 2);
  });
  it("query strana o vuota: mai throw, fallback recenti", () => {
    memStore("ricordo di prova");
    assert.doesNotThrow(() => memRecall('((( " *** '));
    const all = memRecall("");
    assert.equal(all.length, 1);
  });
  it("forget rimuove, store vuoto rifiutato", () => {
    const { id } = memStore("da dimenticare");
    assert.equal(memForget(id), true);
    assert.equal(memForget(id), false);
    assert.throws(() => memStore("   "));
  });
  it("coseno: identici=1, ortogonali=0", () => {
    assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
    assert.equal(cosine([1, 0], [0, 1]), 0);
    assert.equal(cosine([0, 0], [1, 1]), 0);
  });
  it("rerank con embedding fornito", () => {
    memStore("parlo di motori e auto", { embedding: [1, 0] });
    memStore("parlo di cucina e ricette", { embedding: [0, 1] });
    const hits = memRecall("parlo", { embedding: [0, 1] });
    assert.match(hits[0].content, /cucina/);
  });
});

describe("memories nei tool e facoltà", () => {
  it("memory.store/recall/forget via tool", async () => {
    const s = await runTool({ name: "memory.store", args: { content: "mi piace il blu" } });
    assert.equal(s.ok, true);
    const r = await runTool({ name: "memory.recall", args: { query: "blu" } });
    assert.equal(r.ok, true);
    assert.ok((r.data as any[]).some((h) => h.content.includes("blu")));
    const f = await runTool({ name: "memory.forget", args: { id: (s.data as any).id } });
    assert.equal(f.ok, true);
    const e = await runTool({ name: "memory.store", args: { content: "  " } });
    assert.equal(e.ok, false);
  });
  it("memory.search include fonte store", async () => {
    memories.store("il custode ha le chiavi della cantina");
    const { hits, via } = await memory.search("chiavi cantina", 5);
    assert.ok(via.includes("store"));
    assert.ok(hits.some((h) => h.source === "store" && h.text.includes("cantina")));
  });
});
