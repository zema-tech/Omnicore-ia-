// Test router — classifica intent senza mai chiamare i vendor.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classify, route } from "../src/router.ts";

describe("router.classify", () => {
  it("code per task di programmazione", () => {
    assert.equal(classify("fix login bug nel file auth.ts"), "code");
    assert.equal(classify("refactor del modulo pagamenti"), "code");
  });
  it("memory per ricordi e riepiloghi", () => {
    assert.equal(classify("ti ricordi cosa abbiamo detto ieri?"), "memory");
    assert.equal(classify("riepiloga la conversazione"), "memory");
  });
  it("ops per gateway e deploy", () => {
    assert.equal(classify("controlla il gateway"), "ops");
    assert.equal(classify("/status"), "ops");
  });
  it("chat come default", () => {
    assert.equal(classify("ciao, come va?"), "chat");
  });
});

describe("router.route", () => {
  it("abbina handler senza brand vendor in facciata", () => {
    assert.deepEqual(route({ text: "fix bug" }), { intent: "code", handler: "opencode" });
    assert.deepEqual(route({ text: "ciao" }), { intent: "chat", handler: "hermes" });
  });
});
