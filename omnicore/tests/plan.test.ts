// Test piano LLM con fallback: server finto che emette ToolCall JSON,
// e degrado a keyword quando nessun provider risponde.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { planWithLlm, resolvePlan } from "../src/agent/plan.ts";

const KEYS = ["OMNICORE_LLM_BASE_URL", "OMNICORE_LLM_API_KEY", "OMNICORE_LLM_MODEL",
  "OMNICORE_LLM_PROVIDER", "OMNICORE_LLM_LOCAL_MODEL", "OLLAMA_HOST", "OMNICORE_LLM_TIMEOUT"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;

function silence() {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env["OLLAMA_HOST"] = "http://127.0.0.1:1"; // porta chiusa
  process.env["OMNICORE_LLM_TIMEOUT"] = "2000";
}

async function restore() {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  if (fake) {
    await new Promise<void>((res) => fake!.close(() => res()));
    fake = null;
  }
}

beforeEach(silence);
afterEach(restore);

function fakeLlm(body: unknown) {
  fake = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  });
  return new Promise<number>((res) => fake!.listen(0, "127.0.0.1", () => res((fake!.address() as any).port)));
}

describe("agent.planWithLlm", () => {
  it("usa il piano JSON dell'LLM quando valido", async () => {
    const port = await fakeLlm({ choices: [{ message: { content: '[{"name":"memory.search","args":{"query":"x","limit":3}}]' } }] });
    process.env["OMNICORE_LLM_BASE_URL"] = `http://127.0.0.1:${port}`;
    const calls = await planWithLlm("qualcosa");
    assert.deepEqual(calls, [{ name: "memory.search", args: { query: "x", limit: 3 } }]);
  });

  it("scarta tool sconosciuti e respond", async () => {
    const port = await fakeLlm({ choices: [{ message: { content: '[{"name":"hacker.tool","args":{}},{"name":"respond","args":{}}]' } }] });
    process.env["OMNICORE_LLM_BASE_URL"] = `http://127.0.0.1:${port}`;
    assert.equal(await planWithLlm("x"), null);
  });

  it("ritorna null offline", async () => {
    process.env["OMNICORE_LLM_BASE_URL"] = "http://127.0.0.1:1";
    assert.equal(await planWithLlm("ciao"), null);
  });
});

describe("agent.resolvePlan", () => {
  it("planner llm quando il provider risponde", async () => {
    const port = await fakeLlm({ choices: [{ message: { content: '[{"name":"memory.search","args":{}}]' } }] });
    process.env["OMNICORE_LLM_BASE_URL"] = `http://127.0.0.1:${port}`;
    const r = await resolvePlan("ciao");
    assert.equal(r.planner, "llm");
    assert.deepEqual(r.calls.map((c) => c.name), ["memory.search"]);
  });

  it("planner keyword quando nessun provider risponde", async () => {
    process.env["OMNICORE_LLM_BASE_URL"] = "http://127.0.0.1:1";
    const r = await resolvePlan("fix login bug");
    assert.equal(r.planner, "keyword");
    assert.ok(r.calls.some((c) => c.name === "code.task" || c.name === "code.run"));
  });
});
