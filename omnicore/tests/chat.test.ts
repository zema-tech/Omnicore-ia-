// Test logica chat: slash parser + formato eventi (il runner è interattivo).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSlash, formatEvent, SLASH_HELP } from "../src/modules/chat.ts";

describe("chat.parseSlash", () => {
  it("comandi con e senza argomenti", () => {
    assert.deepEqual(parseSlash("/doctor"), { cmd: "doctor", args: "" });
    assert.deepEqual(parseSlash("/dir /tmp/ws"), { cmd: "dir", args: "/tmp/ws" });
    assert.deepEqual(parseSlash("/ROUNDS 3"), { cmd: "rounds", args: "3" });
  });
  it("testo normale -> null", () => {
    assert.equal(parseSlash("ciao come va"), null);
    assert.equal(parseSlash(""), null);
  });
  it("help elenca i comandi", () => {
    for (const c of ["/doctor", "/tools", "/stream", "/sessions", "/quit"]) {
      assert.ok(SLASH_HELP.includes(c));
    }
  });
});

describe("chat.formatEvent", () => {
  it("token grezzo, resto con prefisso", () => {
    assert.equal(formatEvent({ event: "token", text: "Ciao" }), "Ciao");
    assert.match(formatEvent({ event: "tool_start", name: "web.fetch" }), /web\.fetch/);
    assert.match(formatEvent({ event: "tool_end", name: "web.fetch", ok: true }), /ok/);
    assert.match(formatEvent({ event: "loop_end", rounds: 2, planner: "llm" }), /2/);
  });
});
