// Test sintesi mente: fallback euristico offline + percorso LLM con server finto.
// Mai rete reale: il "LLM finto" e un http server locale che risponde canned.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { synthesize } from "../src/mind/synth.ts";

const KEYS = ["OMNICORE_LLM_BASE_URL", "OMNICORE_LLM_API_KEY", "OMNICORE_LLM_MODEL", "OLLAMA_HOST"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(async () => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  if (fake) {
    await new Promise<void>((res) => fake!.close(() => res()));
    fake = null;
  }
});

describe("mind.synthesize", () => {
  it("offline: risposta euristica non vuota, mai dump JSON", async () => {
    process.env["OLLAMA_HOST"] = "http://127.0.0.1:1"; // porta chiusa: fallisce in fretta
    const m = await synthesize("ciao", "chat", []);
    assert.equal(m.via, "euristica");
    assert.ok(m.answer.length > 10);
    assert.ok(!m.answer.trimStart().startsWith("{"));
  });

  it("con LLM finto: usa la risposta del modello", async () => {
    fake = createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: "RISPOSTA-FINTA" } }] }));
    });
    await new Promise<void>((res) => fake!.listen(0, "127.0.0.1", () => res()));
    const port = (fake!.address() as any).port;
    process.env["OMNICORE_LLM_BASE_URL"] = `http://127.0.0.1:${port}`;
    process.env["OMNICORE_LLM_MODEL"] = "finto";
    const m = await synthesize("ping di prova", "chat", []);
    assert.equal(m.via, "llm");
    assert.equal(m.answer, "RISPOSTA-FINTA");
  });

  it("scarta la risposta LLM se e un piano JSON, non un testo", async () => {
    fake = createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: '[{"name":"memory.search","args":{}}]' } }] }));
    });
    await new Promise<void>((res) => fake!.listen(0, "127.0.0.1", () => res()));
    const port = (fake!.address() as any).port;
    process.env["OMNICORE_LLM_BASE_URL"] = `http://127.0.0.1:${port}`;
    process.env["OMNICORE_LLM_MODEL"] = "finto";
    const m = await synthesize("ciao", "chat", []);
    assert.equal(m.via, "euristica");
    assert.ok(m.answer.length > 10);
  });
});
