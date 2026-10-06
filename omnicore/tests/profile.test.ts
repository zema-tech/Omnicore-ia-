// Test profili: stesso core, moduli diversi via OMNICORE_PROFILE.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { moduleGates } from "../src/config.ts";
import { runTool } from "../src/agent/tools.ts";
import { decideRank } from "../src/decide/index.ts";

const KEYS = ["OMNICORE_PROFILE", "TYPESAFE_API_KEY", "TYPESAFE_BASE_URL", "CLM_BASE_URL",
  "OMNICORE_HAS_GPU", "OMNICORE_DECIDE_TIMEOUT"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env["OMNICORE_DECIDE_TIMEOUT"] = "3000";
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

describe("profiles", () => {
  it("light (default): mondo off, clm off", () => {
    assert.deepEqual(moduleGates(), { world: false, clm: false });
  });
  it("medium: mondo on, clm off", () => {
    process.env["OMNICORE_PROFILE"] = "medium";
    assert.deepEqual(moduleGates(), { world: true, clm: false });
  });
  it("alt: tutto on", () => {
    process.env["OMNICORE_PROFILE"] = "alt";
    assert.deepEqual(moduleGates(), { world: true, clm: true });
  });
  it("valore ignoto -> light", () => {
    process.env["OMNICORE_PROFILE"] = "ultra";
    assert.deepEqual(moduleGates(), { world: false, clm: false });
  });

  it("light: world.exec rifiutato dal profilo", async () => {
    const r = await runTool({ name: "world.exec", args: { cmd: "ls" } });
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /profilo light/);
  });
  it("medium: world.exec tenta Mirage (non profilo)", async () => {
    process.env["OMNICORE_PROFILE"] = "medium";
    const r = await runTool({ name: "world.exec", args: { cmd: "ls" } });
    assert.equal(r.ok, false);
    assert.match(r.error ?? "", /mirage/i);
  });

  it("light: clm skippato dal profilo anche con GPU e server su", async () => {
    fake = createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ answers: { azione: { probabilities: { a: 1 } } } }));
    });
    await new Promise<void>((res) => fake!.listen(0, "127.0.0.1", () => res()));
    const port = (fake!.address() as any).port;
    process.env["OMNICORE_HAS_GPU"] = "1";
    process.env["CLM_BASE_URL"] = `http://127.0.0.1:${port}`;
    const r = await decideRank("s", [{ name: "memory.search", desc: "m" }], { allowClm: false });
    assert.equal(r.level, "rules");
  });
});
