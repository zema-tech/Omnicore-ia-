// Test Matrix + Google Chat + Teams contro API finte.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { matrix } from "../src/modules/matrix.ts";
import { gchat } from "../src/modules/gchat.ts";
import { teams } from "../src/modules/teams.ts";
import { channelSend } from "../src/modules/channels.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["MATRIX_HOMESERVER", "MATRIX_TOKEN", "MATRIX_USER", "MATRIX_PASS",
  "GCHAT_WEBHOOK_URL", "TEAMS_TENANT_ID", "TEAMS_CLIENT_ID", "TEAMS_CLIENT_SECRET",
  "TEAMS_TEAM_ID", "TEAMS_CHANNEL_ID", "TEAMS_LOGIN_BASE", "TEAMS_GRAPH_BASE",
  "OMNICORE_MATRIX_TIMEOUT_MS"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;
let posted: any[] = [];

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
      const url = req.url ?? "";
      const auth = String(req.headers["authorization"] ?? "");
      res.setHeader("Content-Type", "application/json");
      if (url.includes("/_matrix/")) {
        if (!auth.startsWith("Bearer ")) {
          res.writeHead(401);
          res.end(JSON.stringify({ errcode: "M_MISSING_TOKEN" }));
          return;
        }
        if (url.includes("/send/")) {
          posted.push(JSON.parse(body || "{}"));
          res.end(JSON.stringify({ event_id: "$ev1" }));
        } else if (url.includes("/sync")) {
          res.end(JSON.stringify({
            next_batch: "s2",
            rooms: { join: { "!r:x": { timeline: { events: [
              { type: "m.room.message", sender: "@a:x", content: { msgtype: "m.text", body: "ciao matrix" } },
              { type: "m.room.member", sender: "@b:x", content: {} },
            ] } } } },
          }));
        } else if (url.includes("/login")) {
          res.end(JSON.stringify({ access_token: "TOK" }));
        } else {
          res.writeHead(404);
          res.end("{}");
        }
        return;
      }
      if (url === "/gchat") {
        posted.push(JSON.parse(body || "{}"));
        res.end("{}");
        return;
      }
      if (url.includes("oauth2")) {
        res.end(JSON.stringify({ access_token: "AZ" }));
        return;
      }
      if (url.includes("/messages")) {
        if (auth !== "Bearer AZ") {
          res.writeHead(401);
          res.end(JSON.stringify({ error: { message: "bad" } }));
          return;
        }
        posted.push(JSON.parse(body || "{}"));
        res.end(JSON.stringify({ id: "tm1" }));
        return;
      }
      res.writeHead(404);
      res.end("{}");
    });
  });
  return new Promise<string>((res) => fake!.listen(0, "127.0.0.1", () => {
    res(`http://127.0.0.1:${(fake!.address() as any).port}`);
  }));
}

describe("matrix", () => {
  it("senza auth: errore onesto", async () => {
    assert.equal((await matrix.send("!r:x", "x")).ok, false);
    assert.equal((await matrix.sync({ timeoutSec: 0 })).ok, false);
  });
  it("send + sync contro homeserver finto", async () => {
    process.env["MATRIX_HOMESERVER"] = await startFake();
    process.env["MATRIX_TOKEN"] = "T";
    const s = await matrix.send("!room:x", "ciao");
    assert.equal(s.ok, true);
    assert.equal(s.data!.event, "$ev1");
    assert.equal(posted[0].body, "ciao");
    const bad = await matrix.send("stanza?", "x");
    assert.equal(bad.ok, false);
    const y = await matrix.sync({ timeoutSec: 0 });
    assert.equal(y.ok, true);
    assert.equal(y.data!.inbound.length, 1);
    assert.equal(y.data!.inbound[0].text, "ciao matrix");
    assert.equal(y.data!.next, "s2");
  });
});

describe("gchat + teams", () => {
  it("gchat via webhook finto", async () => {
    const base = await startFake();
    process.env["GCHAT_WEBHOOK_URL"] = `${base}/gchat`;
    const r = await gchat.send("ciao spazio");
    assert.equal(r.ok, true);
    assert.equal(posted[0].text, "ciao spazio");
    delete process.env["GCHAT_WEBHOOK_URL"];
    assert.equal((await gchat.send("x")).ok, false);
  });
  it("teams via graph finto (token + send)", async () => {
    const base = await startFake();
    process.env["TEAMS_LOGIN_BASE"] = base;
    process.env["TEAMS_GRAPH_BASE"] = base;
    process.env["TEAMS_TENANT_ID"] = "tn";
    process.env["TEAMS_CLIENT_ID"] = "ci";
    process.env["TEAMS_CLIENT_SECRET"] = "cs";
    process.env["TEAMS_TEAM_ID"] = "tm";
    process.env["TEAMS_CHANNEL_ID"] = "ch";
    const r = await teams.send("ciao teams");
    assert.equal(r.ok, true, r.error ?? "");
    assert.equal(r.data!.id, "tm1");
    assert.ok(posted.some((p) => p.body?.content?.includes("ciao teams")));
  });
});

describe("nuovi canali in send e tool", () => {
  it("channelSend matrix/gchat", async () => {
    const base = await startFake();
    process.env["MATRIX_HOMESERVER"] = base;
    process.env["MATRIX_TOKEN"] = "T";
    process.env["GCHAT_WEBHOOK_URL"] = `${base}/gchat`;
    const r = await channelSend("ciao", ["matrix", "!r:x", "gchat"]);
    assert.equal(r.ok, true, r.detail);
  });
  it("tool con conferma", async () => {
    for (const [name, args] of [
      ["matrix.send", { room: "!r:x", text: "x" }],
      ["gchat.send", { text: "x" }],
      ["teams.send", { text: "x" }],
    ] as const) {
      const r = await runTool({ name, args: { ...args } });
      assert.equal(r.needsConfirm, true, name);
    }
    const s = await runTool({ name: "matrix.sync", args: { timeout: 0 } });
    assert.equal(s.ok, false); // senza auth: errore onesto
  });
});
