// Test sicurezza: conferma esplicita per scrivere/eseguire (mai auto).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../src/agent/tools.ts";
import { applyUserConfirm } from "../src/agent/loop.ts";

describe("security.confirm", () => {
  it("code.run senza conferma: proposto, non eseguito", async () => {
    const r = await runTool({ name: "code.run", args: { prompt: "rm -rf /" } });
    assert.equal(r.ok, false);
    assert.equal(r.needsConfirm, true);
    assert.ok((r.preview ?? "").length > 0);
  });
  it("channel.announce senza conferma: proposto, non eseguito", async () => {
    const r = await runTool({ name: "channel.announce", args: { message: "ciao a tutti" } });
    assert.equal(r.ok, false);
    assert.equal(r.needsConfirm, true);
  });
  it("world.exec senza conferma: proposto prima ancora del profilo", async () => {
    const r = await runTool({ name: "world.exec", args: { cmd: "ls" } });
    assert.equal(r.ok, false);
    assert.equal(r.needsConfirm, true);
  });
  it("letture non chiedono conferma", async () => {
    const r = await runTool({ name: "memory.note_search", args: { query: "x" } });
    assert.equal(r.needsConfirm, undefined);
  });
});

describe("security.applyUserConfirm", () => {
  const destructive = [{ name: "code.run" as const, args: {} }];
  it("'confermo' abilita", () => {
    const out = applyUserConfirm(destructive, "confermo: procedi pure");
    assert.equal(out[0].args?.confirm, true);
  });
  it("senza frase esplicita resta spento", () => {
    const out = applyUserConfirm(destructive, "fix login bug");
    assert.equal(out[0].args?.confirm, false);
  });
  it("conferma contrabbandata dal modello azzerata", () => {
    const smuggled = [{ name: "code.run" as const, args: { confirm: true } }];
    const out = applyUserConfirm(smuggled, "fix login bug");
    assert.equal(out[0].args?.confirm, false);
  });
  it("tool innocui intoccati", () => {
    const out = applyUserConfirm([{ name: "memory.search" as const, args: { q: 1 } }], "confermo tutto");
    assert.deepEqual(out, [{ name: "memory.search", args: { q: 1 } }]);
  });
});
