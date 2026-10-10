// Test ciclo ReAct: con LLM il loop continua sui risultati, con budget anti-loop.
// Offline resta a giro singolo.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/agent/loop.ts";

const KEYS = ["OMNICORE_LLM_BASE_URL", "OMNICORE_LLM_API_KEY", "OMNICORE_LLM_MODEL",
  "OMNICORE_LLM_PROVIDER", "OMNICORE_LLM_LOCAL_MODEL", "OLLAMA_HOST", "OMNICORE_LLM_TIMEOUT",
  "OMNICORE_TODOS_FILE", "OMNICORE_MAX_ROUNDS"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;
let dir = "";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), "react-test-"));
  process.env["OMNICORE_TODOS_FILE"] = join(dir, "todos.json");
  process.env["OMNICORE_LLM_TIMEOUT"] = "3000";
  process.env["OLLAMA_HOST"] = "http://127.0.0.1:1";
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

/** LLM finto stateful: risponde in sequenza dalla lista, poi ripete l'ultima. */
async function fakeLlm(script: string[]): Promise<number> {
  let n = 0;
  fake = createServer((_req, res) => {
    const text = script[Math.min(n++, script.length - 1)];
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
  });
  await new Promise<void>((res) => fake!.listen(0, "127.0.0.1", () => res()));
  const port = (fake!.address() as any).port;
  process.env["OMNICORE_LLM_BASE_URL"] = `http://127.0.0.1:${port}`;
  process.env["OMNICORE_LLM_MODEL"] = "finto";
  return port;
}

describe("agent ReAct", () => {
  it("continua sui risultati e si ferma quando il modello dice []", async () => {
    await fakeLlm([
      '[{"name":"todo.add","args":{"text":"compra latte"}}]',
      '[{"name":"todo.list","args":{}}]',
      '[]',
      'RISPOSTA OK',
    ]);
    const r = await runAgent("organizza la spesa");
    assert.equal(r.planner, "llm");
    assert.equal(r.rounds, 2); // iniziale + 1 follow-up (il [] chiude senza eseguire)
    assert.deepEqual(r.plan.map((c) => c.name), ["todo.add", "todo.list"]);
    const names = r.trace.map((t) => t.name);
    assert.ok(names.includes("todo.add"));
    assert.ok(names.includes("todo.list"));
    assert.ok(names.includes("respond"));
    assert.equal(r.reply, "RISPOSTA OK");
  });

  it("budget anti-loop: piano che non finisce mai si ferma a MAX_ROUNDS", async () => {
    process.env["OMNICORE_MAX_ROUNDS"] = "2";
    await fakeLlm(['[{"name":"memory.search","args":{"query":"x"}}]']);
    const r = await runAgent("cerca x");
    assert.equal(r.planner, "llm");
    assert.equal(r.rounds, 2);
    assert.equal(r.trace.filter((t) => t.name === "memory.search").length, 2);
  });

  it("offline: giro singolo come prima", async () => {
    const r = await runAgent("ciao");
    assert.equal(r.planner, "keyword");
    assert.equal(r.rounds, 1);
    assert.ok(r.reply.length > 10);
  });
});
