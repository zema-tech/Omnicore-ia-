// Test TUI: layout, riquadri, eventi — tutto puro, niente terminale.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { box, layout, frame, applyEvent, pushUser, type TuiPanels } from "../src/modules/tui.ts";

const empty = (): TuiPanels => ({ status: [], chat: [], tools: [] });

describe("tui layout", () => {
  it("box: bordi e dimensioni esatte", () => {
    const b = box("t", ["ab"], 10, 5);
    assert.equal(b.length, 5);
    assert.ok(b.every((l) => l.length === 10));
    assert.ok(b[0].startsWith("+") && b[0].endsWith("+"));
    assert.ok(b[4].startsWith("+"));
  });
  it("layout: chat 60/40 e altezze che tornano", () => {
    const l = layout(100, 30);
    assert.equal(l.chatW + l.toolW, 100);
    assert.equal(l.statusH + l.bodyH, 30);
    assert.ok(l.chatW > l.toolW);
  });
  it("frame contiene i tre pannelli", () => {
    const f = frame({ status: ["s"], chat: ["ciao"], tools: ["web ok"] }, 60, 16);
    assert.ok(f.includes("omnicore") && f.includes("ciao") && f.includes("web ok"));
    assert.equal(f.split("\n").length, 16);
  });
});

describe("tui eventi", () => {
  it("token si compattano, tool in timeline", () => {
    let p = empty();
    p = applyEvent(p, { event: "token", text: "Cia" });
    p = applyEvent(p, { event: "token", text: "o!" });
    p = applyEvent(p, { event: "tool_start", name: "web.fetch" });
    p = applyEvent(p, { event: "tool_end", name: "web.fetch", ok: true });
    p = applyEvent(p, { event: "loop_end", rounds: 1, planner: "keyword" });
    assert.deepEqual(p.chat, ["@@Ciao!"]);
    assert.ok(p.tools.join().includes("web.fetch ok"));
    assert.ok(p.tools.join().includes("giri 1"));
    const f = frame(p, 60, 16);
    assert.ok(f.includes("Ciao!") && !f.includes("@@"));
  });
  it("pushUser tronca e prefissa", () => {
    const p = pushUser(empty(), "domanda di prova");
    assert.ok(p.chat[0].startsWith("> "));
  });
});
