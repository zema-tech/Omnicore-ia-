// Test Signal: signal-cli finto (node -e), parse, gate, canali.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { signal } from "../src/modules/signal.ts";
import { channelSend } from "../src/modules/channels.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["SIGNAL_NUMBER", "SIGNAL_CLI_BIN", "SIGNAL_CLI_PREFIX_JSON"];
let saved: Record<string, string | undefined> = {};

const FAKE = `const a=process.argv.slice(1);
if(a.includes('receive'))console.log(JSON.stringify({envelope:{source:'+39111',timestamp:1,dataMessage:{message:'ciao signal'}}}));
process.exit(0);`;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function withFake(): void {
  process.env["SIGNAL_NUMBER"] = "+39000";
  process.env["SIGNAL_CLI_BIN"] = "node";
  process.env["SIGNAL_CLI_PREFIX_JSON"] = JSON.stringify(["-e", FAKE, "--"]);
}

describe("signal", () => {
  it("senza numero: errore onesto", async () => {
    assert.equal((await signal.send("+39123456", "x")).ok, false);
    assert.equal((await signal.poll({ timeoutSec: 1 })).ok, false);
  });
  it("send e poll contro binary finto", async () => {
    withFake();
    const s = await signal.send("+39123456", "ciao");
    assert.equal(s.ok, true);
    assert.equal((s.data as any).to, "+39123456");
    const p = await signal.poll({ timeoutSec: 2 });
    assert.equal(p.ok, true, JSON.stringify(p).slice(0, 200));
    assert.equal(p.data!.inbound[0].text, "ciao signal");
    assert.equal(p.data!.inbound[0].from, "+39111");
  });
  it("binary assente: istruzioni installazione", async () => {
    process.env["SIGNAL_NUMBER"] = "+39000";
    process.env["SIGNAL_CLI_BIN"] = "/nonexistent-signal-cli-xyz";
    const r = await signal.send("+39123456", "x");
    assert.equal(r.ok, false);
    assert.match(r.error!, /signal-cli/);
  });
  it("parse tollerante", () => {
    assert.equal(signal.parse("non json"), null);
    assert.equal(signal.parse({ envelope: { source: "", dataMessage: {} } }), null);
  });
});

describe("signal in canali e tool", () => {
  it("channelSend a numero con +", async () => {
    withFake();
    const r = await channelSend("ciao", ["signal", "+39123456"]);
    assert.equal(r.ok, true, r.detail);
  });
  it("tool: send chiede conferma, poll legge", async () => {
    withFake();
    const s = await runTool({ name: "signal.send", args: { to: "+39123456", text: "x" } });
    assert.equal(s.needsConfirm, true);
    const p = await runTool({ name: "signal.poll", args: { timeout: 1 } });
    assert.equal(p.ok, true);
  });
});
