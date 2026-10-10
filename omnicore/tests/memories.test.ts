// Test memoria strutturata: SQLite+FTS5, BM25, forget, coseno, tool.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memories, memStore, memRecall, memForget, memCount, memClose, memEmbed, cosine } from "../src/modules/memories.ts";
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
  it("BM25 ordina per rilevanza", async () => {
    await memStore("il gatto dorme sul divano rosso");
    await memStore("il cane abbaia in giardino di notte");
    const hits = await memRecall("gatto divano");
    assert.ok(hits.length >= 1);
    assert.match(hits[0].content, /gatto/);
    assert.equal(memCount(), 2);
  });
  it("query strana o vuota: mai throw, fallback recenti", async () => {
    await memStore("ricordo di prova");
    await assert.doesNotReject(memRecall('((( " *** '));
    const all = await memRecall("");
    assert.equal(all.length, 1);
  });
  it("forget rimuove, store vuoto rifiutato", async () => {
    const { id } = await memStore("da dimenticare");
    assert.equal(memForget(id), true);
    assert.equal(memForget(id), false);
    await assert.rejects(memStore("   "));
  });
  it("coseno: identici=1, ortogonali=0", () => {
    assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
    assert.equal(cosine([1, 0], [0, 1]), 0);
    assert.equal(cosine([0, 0], [1, 1]), 0);
  });
  it("rerank con embedding fornito", async () => {
    await memStore("parlo di motori e auto", { embedding: [1, 0] });
    await memStore("parlo di cucina e ricette", { embedding: [0, 1] });
    const hits = await memRecall("parlo", { embedding: [0, 1] });
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
    await memories.store("il custode ha le chiavi della cantina");
    const { hits, via } = await memory.search("chiavi cantina", 5);
    assert.ok(via.includes("store"));
    assert.ok(hits.some((h) => h.source === "store" && h.text.includes("cantina")));
  });
});

describe("memories embedding locali", () => {
  let ollama: Server | null = null;
  afterEach(async () => {
    delete process.env["OMNICORE_EMBED_MODEL"];
    delete process.env["OLLAMA_HOST"];
    if (ollama) {
      await new Promise<void>((res) => ollama!.close(() => res()));
      ollama = null;
    }
  });
  async function fakeOllama(): Promise<string> {
    ollama = createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        const prompt = JSON.parse(body || "{}").prompt ?? "";
        // vettore finto ma deterministico: motori verso [1,0], resto verso [0,1]
        const v = /motor|auto/i.test(prompt) ? [1, 0] : [0, 1];
        res.end(JSON.stringify({ embedding: v }));
      });
    });
    await new Promise<void>((res) => ollama!.listen(0, "127.0.0.1", () => res()));
    return `http://127.0.0.1:${(ollama!.address() as any).port}`;
  }
  it("embed via Ollama finto, null senza modello", async () => {
    assert.equal(await memEmbed("ciao"), null);
    process.env["OLLAMA_HOST"] = await fakeOllama();
    process.env["OMNICORE_EMBED_MODEL"] = "finto";
    assert.deepEqual(await memEmbed("motori"), [1, 0]);
  });
  it("store+recall auto-vettoriali quando il modello è configurato", async () => {
    process.env["OLLAMA_HOST"] = await fakeOllama();
    process.env["OMNICORE_EMBED_MODEL"] = "finto";
    await memStore("manuale motori e auto da corsa");
    await memStore("ricettario cucina e torte");
    const hits = await memRecall("motori auto");
    assert.match(hits[0].content, /motori/);
  });
  it("memory.embed via tool", async () => {
    const e0 = await runTool({ name: "memory.embed", args: { text: "x" } });
    assert.equal(e0.ok, false);
    process.env["OLLAMA_HOST"] = await fakeOllama();
    process.env["OMNICORE_EMBED_MODEL"] = "finto";
    const e1 = await runTool({ name: "memory.embed", args: { text: "y" } });
    assert.equal(e1.ok, true);
    assert.equal((e1.data as any).dims, 2);
  });
});
