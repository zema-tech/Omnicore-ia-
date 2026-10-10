// Test prelazione: flag shouldAbort ferma il loop con graceful stop.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/agent/loop.ts";

let dir = "";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ["OMNICORE_TODOS_FILE", "OLLAMA_HOST"]) saved[k] = process.env[k];
  dir = mkdtempSync(join(tmpdir(), "abort-test-"));
  process.env["OMNICORE_TODOS_FILE"] = join(dir, "todos.json");
  process.env["OLLAMA_HOST"] = "http://127.0.0.1:1";
});

afterEach(() => {
  for (const k of ["OMNICORE_TODOS_FILE", "OLLAMA_HOST"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("agent abort", () => {
  it("abort immediato: zero tool, trace con abort, reply onesta", async () => {
    const r = await runAgent("ciao", { shouldAbort: () => true });
    assert.equal(r.aborted, true);
    assert.ok(r.trace.some((t) => t.name === "abort"));
    assert.ok(!r.trace.some((t) => t.name === "memory.search"));
    assert.match(r.reply, /fermato/i);
  });
  it("abort dopo il primo tool: graceful stop", async () => {
    let checks = 0;
    const r = await runAgent("leggi https://127.0.0.1:1/x e dimmi", {
      shouldAbort: () => checks++ > 0,
    });
    assert.equal(r.aborted, true);
    assert.ok(r.trace.some((t) => t.name === "memory.search" && t.ok));
    assert.ok(!r.trace.some((t) => t.name === "web.fetch"));
    assert.ok(r.trace.some((t) => t.name === "abort"));
  });
});
