// Tappa 55 — code.task LLM-driven: loop multi-step con mock, fallback euristico.
// Workspace isolato via OMNICORE_WORKSPACE temporanea. Mai throw, mai rete.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runCodeAgent,
  planCodeSteps,
  type CodeStep,
} from "../../packages/code/src/index.ts";
import { runTask, formatTimeline } from "../src/modules/code_agent.ts";

let dir = "";
let savedWs: string | undefined;
let savedBaseUrl: string | undefined;

beforeEach(() => {
  savedWs = process.env["OMNICORE_WORKSPACE"];
  savedBaseUrl = process.env["OMNICORE_LLM_BASE_URL"];
  dir = mkdtempSync(join(tmpdir(), "codellm-test-"));
  process.env["OMNICORE_WORKSPACE"] = dir;
  delete process.env["OMNICORE_LLM_BASE_URL"];
});

afterEach(() => {
  if (savedWs === undefined) delete process.env["OMNICORE_WORKSPACE"];
  else process.env["OMNICORE_WORKSPACE"] = savedWs;
  if (savedBaseUrl === undefined) delete process.env["OMNICORE_LLM_BASE_URL"];
  else process.env["OMNICORE_LLM_BASE_URL"] = savedBaseUrl;
  rmSync(dir, { recursive: true, force: true });
});

describe("code.task LLM loop (mock)", () => {
  it("write -> read -> done guidati dal modello", async () => {
    const script: CodeStep[] = [
      { kind: "write", path: "nota.txt", content: "ciao-llm" },
      { kind: "read", path: "nota.txt" },
      { kind: "done" },
    ];
    let calls = 0;
    const r = await runCodeAgent(
      { goal: "crea nota.txt", workspace: dir, budgetSteps: 6 },
      {
        propose: async () => script[Math.min(calls++, script.length - 1)],
      },
    );
    assert.equal(r.via, "code(agent-llm)");
    assert.equal(r.ok, true);
    assert.deepEqual(r.filesTouched, ["nota.txt"]);
    assert.ok(r.steps.some((s) => s.kind === "write" && s.ok));
    assert.ok(r.steps.some((s) => s.kind === "read" && s.output === "ciao-llm"));
    assert.ok(r.timeline.length >= 2);
    assert.match(r.summary, /write/);
  });

  it("edit + grep + glob eseguiti in jail", async () => {
    const script: CodeStep[] = [
      { kind: "write", path: "app.txt", content: "alpha\nbeta\n" },
      { kind: "edit", path: "app.txt", find: "beta", replace: "gamma" },
      { kind: "grep", pattern: "gamma", path: "." },
      { kind: "glob", pattern: "*.txt", path: "." },
      { kind: "done" },
    ];
    let calls = 0;
    const r = await runCodeAgent(
      { goal: "modifica app.txt", workspace: dir, budgetSteps: 8 },
      { propose: async () => script[Math.min(calls++, script.length - 1)] },
    );
    assert.equal(r.ok, true);
    assert.ok(r.filesTouched.includes("app.txt"));
    const grep = r.steps.find((s) => s.kind === "grep");
    assert.equal(grep?.ok, true);
    assert.match(grep?.output ?? "", /gamma/);
    const glob = r.steps.find((s) => s.kind === "glob");
    assert.equal(glob?.ok, true);
    assert.match(glob?.output ?? "", /app\.txt/);
  });

  it("proposer che lancia -> fallback senza throw", async () => {
    const r = await runCodeAgent(
      { goal: "elenca i file", workspace: dir },
      {
        propose: async () => {
          throw new Error("modello muto");
        },
      },
    );
    // primo step null con storia vuota -> euristica
    assert.match(r.via, /heuristic-fallback/);
    assert.ok(r.steps.length > 0);
  });

  it("budget taglia il loop e chiude con done", async () => {
    const r = await runCodeAgent(
      { goal: "loop infinito", workspace: dir, budgetSteps: 2 },
      { propose: async () => ({ kind: "list", path: "." }) },
    );
    assert.equal(r.via, "code(agent-llm)");
    assert.equal(r.steps.filter((s) => s.kind === "list").length, 2);
    assert.equal(r.steps.at(-1)?.kind, "done");
  });
});

describe("code.task offline (euristica invariata)", () => {
  it("senza LLM resta code(agent-native) con timeline", async () => {
    const r = await runCodeAgent({ goal: "elenca i file", workspace: dir });
    assert.equal(r.via, "code(agent-native)");
    assert.equal(r.ok, true);
    assert.ok(Array.isArray(r.timeline));
    assert.ok(r.timeline.length > 0);
  });

  it("planCodeSteps invariato (write+read verifica)", () => {
    const plan = planCodeSteps("crea out.txt con contenuto: salve");
    assert.ok(plan.some((s) => s.kind === "write"));
    assert.equal(plan.at(-1)?.kind, "done");
  });
});

describe("bridge omnicore", () => {
  it("runTask ritorna ok/summary/steps/filesTouched/timeline", async () => {
    const r = await runTask("elenca i file", { workspace: dir });
    assert.equal(typeof r.ok, "boolean");
    assert.equal(typeof r.summary, "string");
    assert.ok(Array.isArray(r.steps));
    assert.ok(Array.isArray(r.filesTouched));
    assert.ok(Array.isArray(r.timeline));
    assert.ok(formatTimeline(r).includes(r.summary.slice(0, 20)));
  });
});
