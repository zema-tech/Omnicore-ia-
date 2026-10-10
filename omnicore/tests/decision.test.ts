// Test modelli decisionali: pesi, lower-better, custom, errori, tool.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decision } from "../src/modules/decision.ts";
import { runTool } from "../src/agent/tools.ts";

describe("decision.evaluate", () => {
  it("budget premia poco costo + molto impatto", () => {
    const r = decision.evaluate({
      model: "budget",
      options: [
        { name: "A-economica", scores: { costo: 2, impatto: 8, urgenza: 5 } },
        { name: "B-cara", scores: { costo: 9, impatto: 9, urgenza: 5 } },
      ],
    });
    assert.equal(r.ok, true);
    assert.equal(r.winner, "A-economica");
    assert.ok(r.report!.includes("Raccomandazione: A-economica"));
  });
  it("priority frena lo sforzo", () => {
    const r = decision.evaluate({
      model: "priority",
      options: [
        { name: "veloce", scores: { impatto: 7, urgenza: 7, sforzo: 2 } },
        { name: "mastodonte", scores: { impatto: 8, urgenza: 7, sforzo: 9 } },
      ],
    });
    assert.equal(r.winner, "veloce");
  });
  it("criteri custom normalizzati", () => {
    const r = decision.evaluate({
      criteria: [{ name: "x", weight: 3 }, { name: "y", weight: 1 }],
      options: [
        { name: "p", scores: { x: 10, y: 0 } },
        { name: "q", scores: { x: 0, y: 10 } },
      ],
    });
    assert.equal(r.winner, "p"); // x pesa 75%
  });
  it("errori onesti: modello ignoto, opzioni poche, score assenti tollerati", () => {
    assert.equal(decision.evaluate({ model: "fantasma", options: [] }).ok, false);
    assert.equal(decision.evaluate({ options: [{ name: "solo", scores: {} }] }).ok, false);
    const r = decision.evaluate({
      model: "budget",
      options: [{ name: "a", scores: {} }, { name: "b", scores: {} }],
    });
    assert.equal(r.ok, true); // mancanti = 5, pareggio stabile
    assert.equal(r.ranking!.length, 2);
  });
  it("tool nel loop", async () => {
    const r = await runTool({
      name: "decision.evaluate",
      args: { model: "priority", options: [{ name: "a", scores: { impatto: 9, urgenza: 1, sforzo: 1 } }, { name: "b", scores: { impatto: 1, urgenza: 1, sforzo: 1 } }] },
    });
    assert.equal(r.ok, true);
    assert.equal((r.data as any).winner, "a");
  });
  it("modelli elencati", () => {
    assert.ok(decision.models().some((m) => m.name === "budget"));
  });
});
