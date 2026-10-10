// Test memoria attiva: auto-learn conservativo + hook nel loop.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { learnFromTurn, memCount, memClose } from "../src/modules/memories.ts";
import { runAgent } from "../src/agent/loop.ts";

let dir = "";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ["OMNICORE_MEMORIES_FILE", "OMNICORE_ACTIVE_MEMORY", "OMNICORE_EMBED_MODEL", "OLLAMA_HOST"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), "active-test-"));
  process.env["OMNICORE_MEMORIES_FILE"] = join(dir, "m.sqlite");
  process.env["OLLAMA_HOST"] = "http://127.0.0.1:1";
});

afterEach(() => {
  memClose();
  for (const k of ["OMNICORE_MEMORIES_FILE", "OMNICORE_ACTIVE_MEMORY", "OMNICORE_EMBED_MODEL", "OLLAMA_HOST"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("active learn", () => {
  it("impara fatti espliciti, ignora chiacchiere", async () => {
    assert.deepEqual(await learnFromTurn("mi chiamo Zem"), { saved: 1 });
    assert.deepEqual(await learnFromTurn("ciao come va"), { saved: 0 });
    assert.equal(memCount(), 1);
  });
  it("deduplica: stesso fatto due volte = 1 ricordo", async () => {
    await learnFromTurn("ricordati che preferisco deploy semplici");
    const r = await learnFromTurn("ricordati che preferisco deploy semplici!");
    assert.equal(r.saved, 0);
    assert.equal(memCount(), 1);
  });
  it("max 3 per turno e kill-switch env", async () => {
    const r = await learnFromTurn("mi chiamo A, preferisco B, lavoro con C, abito a D, odio E");
    assert.ok(r.saved <= 3);
    process.env["OMNICORE_ACTIVE_MEMORY"] = "0";
    assert.deepEqual(await learnFromTurn("mi chiamo Zed"), { saved: 0 });
  });
});

describe("active nel loop", () => {
  it("runAgent impara e riporta learned", async () => {
    const r = await runAgent("ricordati che mi chiamo Zem");
    assert.ok(r.learned >= 1, `learned=${r.learned}`);
    assert.ok(memCount() >= 1);
  });
});
