// Test verifica: channel.announce instrada davvero a signal/discord/telegram.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { channelSend } from "../src/modules/channels.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["SIGNAL_NUMBER", "SIGNAL_CLI_BIN", "SIGNAL_CLI_PREFIX_JSON",
  "DISCORD_BOT_TOKEN", "DISCORD_API_BASE", "TELEGRAM_BOT_TOKEN", "TELEGRAM_API_BASE"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;
let posted: any[] = [];

const SIG_FAKE = `process.exit(0);`;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  posted = [];
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

function startFake(): Promise<string> {
  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      posted.push({ url: req.url, body: JSON.parse(body || "{}") });
      if (req.url?.includes("/channels/")) {
        res.end(JSON.stringify({ id: "m1" }));
      } else if (req.url?.includes("/sendMessage")) {
        res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
      } else {
        res.end(JSON.stringify({ ok: true, result: {} }));
      }
    });
  });
  return new Promise<string>((res) => fake!.listen(0, "127.0.0.1", () => {
    res(`http://127.0.0.1:${(fake!.address() as any).port}`);
  }));
}

describe("announce instrada", () => {
  it("signal via channel.announce (confermato)", async () => {
    process.env["SIGNAL_NUMBER"] = "+39000";
    process.env["SIGNAL_CLI_BIN"] = "node";
    process.env["SIGNAL_CLI_PREFIX_JSON"] = JSON.stringify(["-e", SIG_FAKE, "--"]);
    const r = await runTool({ name: "channel.announce", args: { message: "ciao sig", targets: ["signal", "+39123456"], confirm: true } });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
    assert.match(String((r.data as any) ?? ""), /consegnato/);
  });
  it("discord via channel.announce (confermato)", async () => {
    const base = await startFake();
    process.env["DISCORD_API_BASE"] = base;
    process.env["DISCORD_BOT_TOKEN"] = "D";
    const r = await runTool({ name: "channel.announce", args: { message: "ciao dis", targets: ["discord", "123"], confirm: true } });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
    assert.ok(posted.some((p) => p.body.content === "ciao dis"));
  });
  it("telegram via channel.announce (confermato)", async () => {
    const base = await startFake();
    process.env["TELEGRAM_API_BASE"] = base;
    process.env["TELEGRAM_BOT_TOKEN"] = "T";
    const r = await runTool({ name: "channel.announce", args: { message: "ciao tg", targets: ["456"], confirm: true } });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
  });
  it("senza conferma: niente invio reale", async () => {
    const r = await runTool({ name: "channel.announce", args: { message: "x", targets: ["discord", "1"] } });
    assert.equal(r.needsConfirm, true);
    assert.equal(posted.length, 0);
  });
});
