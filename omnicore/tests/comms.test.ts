// Test Discord + Slack: REST finte, parser, gateway WS finto minimale.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import type { Socket } from "node:net";
import { discord } from "../src/modules/discord.ts";
import { slack } from "../src/modules/slack.ts";
import { channelSend } from "../src/modules/channels.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["DISCORD_BOT_TOKEN", "DISCORD_API_BASE", "DISCORD_GW_URL",
  "SLACK_BOT_TOKEN", "SLACK_API_BASE", "OMNICORE_DISCORD_TIMEOUT_MS", "OMNICORE_SLACK_TIMEOUT_MS"];
let saved: Record<string, string | undefined> = {};
let rest: Server | null = null;
let gw: Server | null = null;
let posted: any[] = [];
let gotIdentify = false;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  posted = [];
  gotIdentify = false;
});

afterEach(async () => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  for (const s of [rest, gw]) {
    if (s) await new Promise<void>((res) => s!.close(() => res()));
  }
  rest = gw = null;
});

function startRest(): Promise<string> {
  rest = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      const auth = req.headers["authorization"] ?? "";
      if (req.url?.includes("/channels/") && auth === "Bot D") {
        posted.push({ url: req.url, body: JSON.parse(body || "{}") });
        res.end(JSON.stringify({ id: "m1" }));
      } else if (req.url === "/chat.postMessage" && auth === "Bearer S") {
        posted.push({ url: req.url, body: JSON.parse(body || "{}") });
        res.end(JSON.stringify({ ok: true, ts: "1.0" }));
      } else {
        res.writeHead(req.url === "/chat.postMessage" ? 200 : 401);
        res.end(JSON.stringify({ ok: false, error: "invalid_auth" }));
      }
    });
  });
  return new Promise<string>((res) => rest!.listen(0, "127.0.0.1", () => {
    res(`http://127.0.0.1:${(rest!.address() as any).port}`);
  }));
}

function wsFrame(obj: unknown): Uint8Array {
  const b = Buffer.from(JSON.stringify(obj));
  if (b.length < 126) return Buffer.concat([Buffer.from([0x81, b.length]), b]);
  const h = Buffer.alloc(4);
  h[0] = 0x81;
  h[1] = 126;
  h.writeUInt16BE(b.length, 2);
  return Buffer.concat([h, b]);
}

/** Legge UN frame mascherato dal client e ritorna il payload. */
function readClientFrame(acc: Buffer): { payload: string; rest: Buffer } | null {
  if (acc.length < 2) return null;
  const masked = (acc[1] & 0x80) !== 0;
  let len = acc[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    if (acc.length < 4) return null;
    len = acc.readUInt16BE(2);
    off = 4;
  }
  const keyOff = off;
  off += masked ? 4 : 0;
  if (acc.length < off + len) return null;
  const payload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) payload[i] = acc[off + i] ^ (masked ? acc[keyOff + (i % 4)] : 0);
  return { payload: payload.toString("utf8"), rest: acc.slice(off + len) };
}

function startGw(): Promise<string> {
  gw = createServer();
  gw.on("upgrade", (req, socket: Socket) => {
    const accept = createHash("sha1")
      .update((req.headers["sec-websocket-key"] ?? "") + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
      .digest("base64");
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
    socket.write(wsFrame({ op: 10, d: { heartbeat_interval: 60 } }));
    let acc: any = Buffer.alloc(0);
    let sentDispatch = false;
    socket.on("error", () => {});
    socket.on("data", (d) => {
      acc = Buffer.concat([acc, d]);
      for (;;) {
        const f = readClientFrame(acc);
        if (!f) break;
        acc = f.rest;
        if (!sentDispatch && f.payload.includes('"op":2')) {
          sentDispatch = true;
          gotIdentify = true;
          socket.write(wsFrame({ op: 0, s: 7, t: "MESSAGE_CREATE", d: { id: "m9", channel_id: "123", author: { username: "zem", bot: false }, content: "ciao discord" } }));
          setTimeout(() => socket.end(), 150);
        }
      }
    });
  });
  return new Promise<string>((res) => gw!.listen(0, "127.0.0.1", () => {
    res(`ws://127.0.0.1:${(gw!.address() as any).port}`);
  }));
}

describe("discord", () => {
  it("senza token: errore onesto", async () => {
    assert.equal((await discord.send("1", "x")).ok, false);
    assert.equal((await discord.listen({ timeoutSec: 1 })).ok, false);
  });
  it("send spezza a 2000 e autentica Bot", async () => {
    process.env["DISCORD_API_BASE"] = await startRest();
    process.env["DISCORD_BOT_TOKEN"] = "D";
    const r = await discord.send("123", "y".repeat(4500));
    assert.equal(r.ok, true);
    assert.equal(r.data!.parts, 3);
    assert.ok(posted.every((p) => String(p.body.content).length <= 2000));
  });
  it("parse: messaggi sì, bot e altri eventi no", () => {
    const ok = discord.parse({ t: "MESSAGE_CREATE", d: { id: "1", channel_id: "c", author: { username: "u" }, content: "ciao" } });
    assert.equal(ok?.author, "u");
    assert.equal(discord.parse({ t: "MESSAGE_CREATE", d: { id: "1", author: { bot: true }, content: "x" } }), null);
    assert.equal(discord.parse({ t: "READY", d: {} }), null);
  });
  it("listen: hello→identify→dispatch via gateway finto", async () => {
    process.env["DISCORD_GW_URL"] = await startGw();
    process.env["DISCORD_BOT_TOKEN"] = "D";
    const r = await discord.listen({ timeoutSec: 5 });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
    assert.equal(r.data!.inbound.length, 1);
    assert.equal(r.data!.inbound[0].text, "ciao discord");
    assert.equal(gotIdentify, true);
  });
});

describe("slack", () => {
  it("send ok e channel invalido onesto", async () => {
    process.env["SLACK_API_BASE"] = await startRest();
    process.env["SLACK_BOT_TOKEN"] = "S";
    const r = await slack.send("C123", "prova slack");
    assert.equal(r.ok, true);
    assert.equal(posted[0].body.channel, "C123");
    const bad = await slack.send("!!", "x");
    assert.equal(bad.ok, false);
  });
  it("parse Events API: challenge, messaggi, bot esclusi", () => {
    assert.equal(slack.parse({ type: "url_verification", challenge: "abc" }).challenge, "abc");
    const m = slack.parse({ event: { type: "message", channel: "C1", user: "U1", text: "ciao" } });
    assert.equal(m.inbound?.text, "ciao");
    assert.deepEqual(slack.parse({ event: { type: "message", bot_id: "B", text: "x" } }), {});
  });
});

describe("discord/slack in canali e tool", () => {
  it("channelSend a discord e slack configurati", async () => {
    const base = await startRest();
    process.env["DISCORD_API_BASE"] = base;
    process.env["SLACK_API_BASE"] = base;
    process.env["DISCORD_BOT_TOKEN"] = "D";
    process.env["SLACK_BOT_TOKEN"] = "S";
    const r = await channelSend("ciao canali", ["discord", "123", "slack", "C999"]);
    assert.equal(r.ok, true, r.detail);
    assert.match(r.detail, /consegnato/);
  });
  it("tool send senza conferma: proposti", async () => {
    const d = await runTool({ name: "discord.send", args: { channel: "1", text: "x" } });
    assert.equal(d.needsConfirm, true);
    const s = await runTool({ name: "slack.send", args: { channel: "C1", text: "x" } });
    assert.equal(s.needsConfirm, true);
  });
});
