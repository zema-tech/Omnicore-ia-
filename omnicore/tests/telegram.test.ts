// Test backend Telegram reale contro Bot API finta (niente rete esterna).
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { telegram } from "../src/modules/telegram.ts";
import { channelSend } from "../src/modules/channels.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_API_BASE", "OMNICORE_TELEGRAM_TIMEOUT_MS"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;
let sent: any[] = [];
let updates: any[] = [];

const TOKEN = "TESTTOKEN";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  sent = [];
  updates = [];
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
      if (!req.url?.startsWith(`/bot${TOKEN}/`)) {
        res.writeHead(401);
        res.end(JSON.stringify({ ok: false, description: "Unauthorized" }));
        return;
      }
      const method = req.url.slice(`/bot${TOKEN}/`.length);
      if (method === "getMe") {
        res.end(JSON.stringify({ ok: true, result: { id: 1, username: "omnibot" } }));
      } else if (method === "sendMessage") {
        sent.push(JSON.parse(body || "{}"));
        res.end(JSON.stringify({ ok: true, result: { message_id: sent.length } }));
      } else if (method === "getUpdates") {
        res.end(JSON.stringify({ ok: true, result: updates }));
      } else {
        res.end(JSON.stringify({ ok: false, description: "unknown method" }));
      }
    });
  });
  return new Promise<string>((res) => fake!.listen(0, "127.0.0.1", () => {
    res(`http://127.0.0.1:${(fake!.address() as any).port}`);
  }));
}

async function withBot(): Promise<void> {
  process.env["TELEGRAM_API_BASE"] = await startFake();
  process.env["TELEGRAM_BOT_TOKEN"] = TOKEN;
}

describe("telegram bot api", () => {
  it("senza token: errore onesto, mai throw", async () => {
    assert.equal((await telegram.me()).ok, false);
    assert.equal((await telegram.send(1, "ciao")).ok, false);
    assert.equal((await telegram.poll({ timeoutSec: 0 })).ok, false);
  });
  it("me verifica il bot", async () => {
    await withBot();
    const r = await telegram.me();
    assert.equal(r.ok, true);
    assert.equal(r.data!.username, "omnibot");
  });
  it("send spezza testi lunghi in parti da max 4000", async () => {
    await withBot();
    const r = await telegram.send(123, "x".repeat(9000));
    assert.equal(r.ok, true);
    assert.ok(r.data!.parts >= 3);
    assert.ok(sent.length >= 3);
    assert.ok(sent.every((s) => s.chat_id === 123 && String(s.text).length <= 4000));
  });
  it("poll parsa messaggi, salta update senza testo, avanza offset", async () => {
    await withBot();
    updates = [
      { update_id: 10, message: { chat: { id: 7, type: "private" }, from: { id: 9, username: "zem" }, text: "ciao bot" } },
      { update_id: 11, message: { chat: { id: 7, type: "private" }, from: { id: 9 }, sticker: {} } },
    ];
    const r = await telegram.poll({ timeoutSec: 0 });
    assert.equal(r.ok, true);
    assert.equal(r.data!.inbound.length, 1);
    assert.equal(r.data!.inbound[0].text, "ciao bot");
    assert.equal(r.data!.inbound[0].from, "@zem");
    assert.equal(r.data!.nextOffset, 12);
  });
});

describe("telegram nei canali e tool", () => {
  it("channelSend consegna a chat_id numerici", async () => {
    await withBot();
    const r = await channelSend("prova invio", ["456"]);
    assert.equal(r.ok, true);
    assert.match(r.detail, /consegnato/);
    assert.equal(sent[0].chat_id, 456);
  });
  it("tool telegram.poll senza token: errore onesto", async () => {
    const r = await runTool({ name: "telegram.poll", args: {} });
    assert.equal(r.ok, false);
    assert.match(r.error!, /TELEGRAM_BOT_TOKEN/);
  });
});
