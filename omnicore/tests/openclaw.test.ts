// Test fusione OpenClaw: canali nativi, cron scheduler, registro agenti.
// Stato isolato via OMNICORE_CRON_FILE / OMNICORE_AGENTS_FILE temporanei.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { listChannels, channelStatus, channelSend } from "../src/modules/channels.ts";
import { cronAdd, cronList, cronRemove, cronTick } from "../src/modules/cron.ts";
import { agentRegister, agentList, agentPause } from "../src/modules/agents.ts";
import { runTool } from "../src/agent/tools.ts";

let dir = "";
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;
const KEYS = ["OMNICORE_CRON_FILE", "OMNICORE_AGENTS_FILE", "OMNICORE_WEBHOOK_URL"];

beforeEach(() => {
  saved = {};
  for (const k of [...KEYS, "TELEGRAM_BOT_TOKEN", "WHATSAPP_TOKEN", "DISCORD_WEBHOOK_URL"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
  process.env["OMNICORE_CRON_FILE"] = join(dir, "cron.json");
  process.env["OMNICORE_AGENTS_FILE"] = join(dir, "agents.json");
});

afterEach(async () => {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  if (fake) {
    await new Promise<void>((res) => fake!.close(() => res()));
    fake = null;
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("channels", () => {
  it("console sempre presente e attiva", () => {
    assert.ok(listChannels().some((c) => c.kind === "console"));
    assert.ok(channelStatus().find((c) => c.id === "console")?.ok);
  });
  it("send console logga ok", async () => {
    const r = await channelSend("prova");
    assert.equal(r.ok, true);
    assert.equal(r.via, "channel(native)");
  });
  it("webhook consegna al server finto", async () => {
    let got: string = "";
    fake = createServer((req, res) => {
      let b = "";
      req.on("data", (d) => (b += d));
      req.on("end", () => {
        got = b;
        res.end("{}");
      });
    });
    await new Promise<void>((res) => fake!.listen(0, "127.0.0.1", () => res()));
    process.env["OMNICORE_WEBHOOK_URL"] = `http://127.0.0.1:${(fake!.address() as any).port}`;
    const r = await channelSend("ciao webhook", ["webhook"]);
    assert.equal(r.ok, true);
    assert.ok(got.includes("ciao webhook"));
  });
  it("target sconosciuto: errore onesto", async () => {
    const r = await channelSend("x", ["telegram"]);
    assert.equal(r.ok, false);
  });
});

describe("cron", () => {
  it("add/list/remove", () => {
    cronAdd("prova", { kind: "delay", delayMs: 60000 }, { kind: "noop" });
    assert.equal(cronList().length, 1);
    assert.equal(cronRemove("prova"), true);
    assert.equal(cronList().length, 0);
    assert.equal(cronRemove("prova"), false);
  });
  it("nome invalido rifiutato", () => {
    assert.throws(() => cronAdd("nome sbagliato!!", { kind: "delay", delayMs: 1 }));
  });
  it("tick esegue i job dovuti una sola volta", async () => {
    cronAdd("subito", { kind: "delay", delayMs: 0 }, { kind: "announce", message: "sveglia" });
    const first = await cronTick(Date.now() + 1000);
    assert.equal(first.length, 1);
    assert.equal(first[0].ok, true);
    const second = await cronTick(Date.now() + 2000);
    assert.equal(second.length, 0); // once implicito: non riesegue
  });
});

describe("agents", () => {
  it("register/list/pause", () => {
    agentRegister("sentinella", ["memory.search"]);
    assert.deepEqual(agentList().map((a) => a.name), ["sentinella"]);
    assert.equal(agentPause("sentinella"), true);
    assert.equal(agentList()[0].status, "paused");
    assert.equal(agentPause("fantasma"), false);
  });
});

describe("tools openclaw", () => {
  it("channel.status nativo", async () => {
    const r = await runTool({ name: "channel.status", args: {} });
    assert.equal(r.ok, true);
    assert.equal(r.via, "channel(native)");
  });
  it("cron.add + agents.register via tool", async () => {
    const c = await runTool({ name: "cron.add", args: { name: "j1", schedule: { kind: "delay", delayMs: 5000 } } });
    assert.equal(c.ok, true);
    const a = await runTool({ name: "agents.register", args: { name: "eco", skills: ["code.read"] } });
    assert.equal(a.ok, true);
  });
});
