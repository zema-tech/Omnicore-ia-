// Test agent loop offline (nessun LLM, nessun vendor obbligatorio):
// plan deterministico + facolta best-effort + sintesi euristica.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planKeyword } from "../src/agent/plan.ts";
import { runAgent } from "../src/agent/loop.ts";

describe("agent.planKeyword", () => {
  it("chat: solo memoria + risposta", () => {
    const p = planKeyword("ciao");
    assert.equal(p.intent, "chat");
    assert.deepEqual(p.calls.map((c) => c.name), ["memory.search"]);
  });
  it("code: aggiunge le mani", () => {
    const p = planKeyword("fix login bug");
    assert.equal(p.intent, "code");
    assert.ok(p.calls.some((c) => c.name === "code.run"));
  });
});

describe("agent.runAgent", () => {
  it("turno completo offline con reply naturale", async () => {
    const r = await runAgent("ciao");
    assert.ok(typeof r.reply === "string" && r.reply.length > 10);
    const names = r.trace.map((t) => t.name);
    assert.ok(names.includes("memory.search"));
    assert.ok(names.includes("respond"));
    assert.ok(!r.reply.trimStart().startsWith("{"));
  });
});
