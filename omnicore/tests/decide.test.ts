// Test decide: regole locali, cascata con backend finti, gating nel loop.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { verifyLocal, rankLocal, attemptKey } from "../src/decide/rules.ts";
import { decideRank, decideVerify } from "../src/decide/index.ts";
import { runAgent } from "../src/agent/loop.ts";

const KEYS = ["TYPESAFE_API_KEY", "TYPESAFE_BASE_URL", "CLM_API_KEY", "CLM_BASE_URL",
  "OMNICORE_JEV_THRESHOLD", "OMNICORE_CLM_THRESHOLD", "OMNICORE_HAS_GPU", "OMNICORE_DECIDE_TIMEOUT"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env["OMNICORE_HAS_GPU"] = "0"; // niente GPU nei test
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

function fakeDecide(answers: unknown) {
  fake = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ answers }));
  });
  return new Promise<number>((res) => fake!.listen(0, "127.0.0.1", () => res((fake!.address() as any).port)));
}

describe("decide.rules", () => {
  it("distruttivo senza conferma -> review", () => {
    const r = verifyLocal({ name: "code.run", args: { prompt: "x" } });
    assert.equal(r.verdict, "review");
  });
  it("distruttivo con conferma -> allow", () => {
    const r = verifyLocal({ name: "code.run", args: {} }, { confirm: true });
    assert.equal(r.verdict, "allow");
  });
  it("tentativo identico ripetuto -> deny (anti-loop)", () => {
    const call = { name: "memory.search" as const, args: { query: "x" } };
    const r = verifyLocal(call, { recentAttempts: [attemptKey(call)] });
    assert.equal(r.verdict, "deny");
  });
  it("backend segnalato offline -> deny", () => {
    const r = verifyLocal({ name: "memory.search", args: {} }, { backendDown: ["memory"] });
    assert.equal(r.verdict, "deny");
  });
  it("rank: sicuri prima, distruttivi ultimi", () => {
    const ranked = rankLocal(["code.run", "memory.search", "respond"]);
    assert.deepEqual(ranked.map((r) => r.name), ["memory.search", "respond", "code.run"]);
  });
});

describe("decide.cascade", () => {
  it("senza chiavi ne GPU: solo regole locali", async () => {
    const r = await decideRank("stato", [{ name: "code.run", desc: "c" }, { name: "memory.search", desc: "m" }]);
    assert.equal(r.level, "rules");
    assert.equal(r.ranking[0].name, "memory.search");
    const v = await decideVerify({ name: "memory.search", args: {} }, {});
    assert.equal(v.level, "rules");
    assert.equal(v.verdict.verdict, "allow");
  });

  it("jev ordina per probabilita quando risponde", async () => {
    const port = await fakeDecide({ azione: { probabilities: { "code.run": 0.8, "memory.search": 0.2 } } });
    process.env["TYPESAFE_API_KEY"] = "finta";
    process.env["TYPESAFE_BASE_URL"] = `http://127.0.0.1:${port}`;
    const r = await decideRank("stato", [
      { name: "memory.search", desc: "m" },
      { name: "code.run", desc: "c" },
    ]);
    assert.equal(r.level, "jev");
    assert.deepEqual(r.ranking.map((x) => x.name), ["code.run", "memory.search"]);
  });

  it("jev noul basso -> deny fail-closed", async () => {
    const port = await fakeDecide({ sicura: { noul: 0.1 } });
    process.env["TYPESAFE_API_KEY"] = "finta";
    process.env["TYPESAFE_BASE_URL"] = `http://127.0.0.1:${port}`;
    const v = await decideVerify({ name: "memory.search", args: {} }, {});
    assert.equal(v.level, "jev");
    assert.equal(v.verdict.verdict, "deny");
  });
});

describe("decide.loop-gating", () => {
  it("code.run senza conferma viene bloccato dal decide nel loop", async () => {
    const r = await runAgent("fix login bug urgente");
    const blocked = r.trace.find((t) => t.name === "code.run");
    assert.ok(blocked);
    assert.equal(blocked.ok, false);
    assert.ok(blocked.via.startsWith("decide("));
  });
});
