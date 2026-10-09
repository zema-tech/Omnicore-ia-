// Test cervello BYOK: config env>json, doctor api/local/euristica, prompt senza vendor.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { llmConfig, llmDoctor } from "../src/mind/llm.ts";
import { PERSONA, buildLlmPrompt } from "../src/mind/synth.ts";

const KEYS = ["OMNICORE_LLM_BASE_URL", "OMNICORE_LLM_API_KEY", "OMNICORE_LLM_MODEL",
  "OMNICORE_LLM_PROVIDER", "OMNICORE_LLM_LOCAL_MODEL", "OLLAMA_HOST", "OMNICORE_LLM_TIMEOUT"];
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

function fakeApi(text: string): Promise<number> {
  fake = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
  });
  return new Promise<number>((res) => fake!.listen(0, "127.0.0.1", () => res((fake!.address() as any).port)));
}

describe("mind.llmConfig", () => {
  it("env vince, default senza niente", () => {
    process.env["OLLAMA_HOST"] = "http://127.0.0.1:1";
    const c = llmConfig();
    assert.equal(c.provider, "api");
    assert.equal(c.baseUrl, "");
    assert.equal(c.model, "omnicore-fusion");
  });
  it("baseUrl+model da env", () => {
    process.env["OMNICORE_LLM_BASE_URL"] = "http://x:1/";
    process.env["OMNICORE_LLM_MODEL"] = "mia";
    const c = llmConfig();
    assert.equal(c.baseUrl, "http://x:1"); // slash finale rimosso
    assert.equal(c.model, "mia");
  });
});

describe("mind.llmDoctor", () => {
  it("api ok -> active api", async () => {
    const port = await fakeApi("ok");
    process.env["OMNICORE_LLM_BASE_URL"] = `http://127.0.0.1:${port}`;
    process.env["OMNICORE_LLM_MODEL"] = "finto";
    process.env["OLLAMA_HOST"] = "http://127.0.0.1:1";
    process.env["OMNICORE_LLM_TIMEOUT"] = "3000";
    const d = await llmDoctor();
    assert.equal(d.api.ok, true);
    assert.equal(d.local.ok, false);
    assert.equal(d.active, "api");
  });
  it("niente backend -> euristica, mai throw", async () => {
    process.env["OLLAMA_HOST"] = "http://127.0.0.1:1";
    process.env["OMNICORE_LLM_TIMEOUT"] = "2000";
    const d = await llmDoctor();
    assert.equal(d.api.ok, false);
    assert.equal(d.local.ok, false);
    assert.equal(d.active, "euristica");
    assert.ok(d.api.detail.length > 0);
  });
});

describe("mind.prompt senza vendor", () => {
  it("PERSONA e prompt non citano progetti o motori", () => {
    const p = buildLlmPrompt("ciao", "chat", []);
    for (const s of [PERSONA, p]) {
      assert.ok(!/hermes|opencode|openclaw|mirage|clm/i.test(s), `brand nel prompt: ${s.slice(0, 80)}`);
    }
  });
});
