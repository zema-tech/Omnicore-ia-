// Test budget LLM: tracking, alert 80%, gate, fallback cheap, tool.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { budget, recordUsage, budgetStatus, budgetGate, estimateTokens } from "../src/modules/budget.ts";
import { llmChat } from "../src/mind/llm.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["OMNICORE_USAGE_FILE", "OMNICORE_BUDGET_TOKENS_DAY", "OMNICORE_LLM_CHEAP_MODEL",
  "OMNICORE_LLM_BASE_URL", "OMNICORE_LLM_API_KEY", "OMNICORE_LLM_MODEL", "OMNICORE_LLM_PROVIDER",
  "OMNICORE_LLM_LOCAL_MODEL", "OLLAMA_HOST", "OMNICORE_LLM_TIMEOUT"];
let saved: Record<string, string | undefined> = {};
let dir = "";
let fake: Server | null = null;
let seenModel = "";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), "budget-test-"));
  process.env["OMNICORE_USAGE_FILE"] = join(dir, "u.jsonl");
  process.env["OMNICORE_LLM_TIMEOUT"] = "3000";
  process.env["OLLAMA_HOST"] = "http://127.0.0.1:1";
});

afterEach(async () => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
  if (fake) {
    await new Promise<void>((res) => fake!.close(() => res()));
    fake = null;
  }
});

function startFake(): Promise<number> {
  seenModel = "";
  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      try {
        seenModel = JSON.parse(body || "{}").model ?? "";
      } catch { /* noop */ }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  return new Promise<number>((res) => fake!.listen(0, "127.0.0.1", () => res((fake!.address() as any).port)));
}

describe("budget tracking", () => {
  it("record + status sommano token reali", () => {
    recordUsage({ model: "m", via: "api", promptTokens: 100, completionTokens: 50, estimated: false, ms: 10 });
    const st = budgetStatus();
    assert.equal(st.usedTokens, 150);
    assert.equal(st.calls, 1);
    assert.equal(st.pct, null); // budget 0 = illimitato
    assert.equal(st.over, false);
  });
  it("alert 80% e over 100%", () => {
    process.env["OMNICORE_BUDGET_TOKENS_DAY"] = "200";
    recordUsage({ model: "m", via: "api", promptTokens: 170, completionTokens: 0, estimated: true, ms: 1 });
    assert.equal(budgetStatus().alert80, true);
    recordUsage({ model: "m", via: "api", promptTokens: 40, completionTokens: 0, estimated: true, ms: 1 });
    const st = budgetStatus();
    assert.equal(st.over, true);
    assert.equal(st.alert80, false);
  });
  it("locale gratis fuori budget", () => {
    process.env["OMNICORE_BUDGET_TOKENS_DAY"] = "10";
    recordUsage({ model: "l", via: "local", promptTokens: 9999, completionTokens: 0, estimated: true, ms: 1 });
    assert.equal(budgetStatus().over, false);
  });
  it("gate: stop senza cheap, swap con cheap", () => {
    process.env["OMNICORE_BUDGET_TOKENS_DAY"] = "10";
    recordUsage({ model: "m", via: "api", promptTokens: 50, completionTokens: 0, estimated: true, ms: 1 });
    const stop = budgetGate("pro");
    assert.equal(stop.allowed, false);
    process.env["OMNICORE_LLM_CHEAP_MODEL"] = "mini";
    const swap = budgetGate("pro");
    assert.equal(swap.allowed, true);
    assert.equal(swap.model, "mini");
  });
  it("stima ~chars/4", () => {
    assert.equal(estimateTokens("abcdefgh"), 2);
  });
});

describe("budget con LLM finto", () => {
  it("usage reale registrata e cheap usato oltre budget", async () => {
    const port = await startFake();
    process.env["OMNICORE_LLM_BASE_URL"] = `http://127.0.0.1:${port}`;
    process.env["OMNICORE_LLM_MODEL"] = "pro";
    const t = await llmChat("sys", "ciao");
    assert.equal(t, "OK");
    assert.equal(seenModel, "pro");
    assert.equal(budgetStatus().usedTokens, 15);
    process.env["OMNICORE_BUDGET_TOKENS_DAY"] = "10";
    process.env["OMNICORE_LLM_CHEAP_MODEL"] = "mini";
    const t2 = await llmChat("sys", "ciao");
    assert.equal(t2, "OK");
    assert.equal(seenModel, "mini");
  });
  it("oltre budget senza cheap: null (euristica)", async () => {
    const port = await startFake();
    process.env["OMNICORE_LLM_BASE_URL"] = `http://127.0.0.1:${port}`;
    process.env["OMNICORE_LLM_MODEL"] = "pro";
    process.env["OMNICORE_BUDGET_TOKENS_DAY"] = "10";
    recordUsage({ model: "pro", via: "api", promptTokens: 50, completionTokens: 0, estimated: true, ms: 1 });
    assert.equal(await llmChat("sys", "ciao"), null);
  });
});

describe("budget nel loop", () => {
  it("budget.status via tool", async () => {
    recordUsage({ model: "m", via: "api", promptTokens: 7, completionTokens: 0, estimated: true, ms: 1 });
    const r = await runTool({ name: "budget.status", args: {} });
    assert.equal(r.ok, true);
    assert.equal((r.data as any).usedTokens, 7);
    assert.ok(budget.file().length > 0);
  });
});
