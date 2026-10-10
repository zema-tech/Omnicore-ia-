// Test streaming: SSE parser, fallback non-stream, eventi loop, prefisso stabile.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { llmChatStream } from "../src/mind/llm.ts";
import { pcache } from "../src/mind/pcache.ts";
import { runAgent } from "../src/agent/loop.ts";

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

function startFake(mode: "sse" | "no-stream"): Promise<number> {
  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const wantsStream = body.includes('"stream":true');
      if (mode === "sse" && wantsStream) {
        res.setHeader("Content-Type", "text/event-stream");
        for (const piece of ["CIA", "O!"]) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
        }
        res.end("data: [DONE]\n\n");
        return;
      }
      if (wantsStream) {
        res.writeHead(500);
        res.end("no stream qui");
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: "RISPOSTA-PIENA" } }] }));
    });
  });
  return new Promise<number>((res) => fake!.listen(0, "127.0.0.1", () => res((fake!.address() as any).port)));
}

describe("llm streaming", () => {
  it("SSE: token incrementali + testo pieno", async () => {
    const port = await startFake("sse");
    process.env["OMNICORE_LLM_BASE_URL"] = `http://127.0.0.1:${port}`;
    process.env["OMNICORE_LLM_MODEL"] = "finto";
    const pieces: string[] = [];
    const r = await llmChatStream("sys", "ciao", 50, (t) => pieces.push(t));
    assert.ok(r && r.streamed);
    assert.equal(r.text, "CIAO!");
    assert.deepEqual(pieces, ["CIA", "O!"]);
  });
  it("stream rotto: fallback non-stream senza perdere risposta", async () => {
    const port = await startFake("no-stream");
    process.env["OMNICORE_LLM_BASE_URL"] = `http://127.0.0.1:${port}`;
    process.env["OMNICORE_LLM_MODEL"] = "finto";
    const r = await llmChatStream("sys", "ciao", 50, () => {});
    assert.ok(r && !r.streamed);
    assert.equal(r.text, "RISPOSTA-PIENA");
  });
});

describe("eventi loop", () => {
  it("offline: tool_start/end + loop_end, nessun token", async () => {
    const events: any[] = [];
    const r = await runAgent("ciao", { onEvent: (e) => events.push(e) });
    const kinds = events.map((e) => e.event);
    assert.ok(kinds.includes("tool_start"));
    assert.ok(kinds.includes("tool_end"));
    assert.ok(kinds.includes("loop_end"));
    assert.ok(!kinds.includes("token"));
    assert.equal(events.find((e) => e.event === "loop_end").rounds, r.rounds);
  });
});

describe("prompt-cache stabile", () => {
  it("hash prefisso identico tra turni diversi", () => {
    assert.equal(pcache.hash(), pcache.hash());
    assert.match(pcache.hash(), /^[0-9a-f]{16}$/);
    assert.ok(pcache.prefix().length > 50);
  });
});
