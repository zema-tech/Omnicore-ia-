// Test Google Workspace + Spotify contro API finte.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { google } from "../src/modules/google.ts";
import { spotify } from "../src/modules/spotify.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["GOOGLE_TOKEN", "GOOGLE_API_BASE", "SPOTIFY_TOKEN", "SPOTIFY_API_BASE"];
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
      const auth = String(req.headers["authorization"] ?? "");
      res.setHeader("Content-Type", "application/json");
      const url = req.url ?? "";
      if (url.includes("/gmail/") || url.includes("/calendar/")) {
        if (auth !== "Bearer G") {
          res.writeHead(401);
          res.end(JSON.stringify({ error: { message: "bad token" } }));
          return;
        }
        if (url.includes("/messages/send")) {
          posted.push(JSON.parse(body || "{}"));
          res.end(JSON.stringify({ id: "m1" }));
        } else if (url.includes("/messages?") || url.includes("/messages/")) {
          if (url.includes("/messages/")) {
            res.end(JSON.stringify({ payload: { headers: [{ name: "From", value: "ana@x.it" }, { name: "Subject", value: "Ciao" }, { name: "Date", value: "ieri" }] } }));
          } else {
            res.end(JSON.stringify({ messages: [{ id: "a" }, { id: "b" }] }));
          }
        } else if (url.includes("/events")) {
          if (req.method === "POST") {
            posted.push(JSON.parse(body || "{}"));
            res.end(JSON.stringify({ id: "e1", htmlLink: "http://cal/e1" }));
          } else {
            res.end(JSON.stringify({ items: [{ id: "e1", summary: "Sync", start: { dateTime: "2026-01-01T10:00:00" }, end: { dateTime: "2026-01-01T11:00:00" } }] }));
          }
        } else {
          res.writeHead(404);
          res.end("{}");
        }
        return;
      }
      if (auth !== "Bearer S") {
        res.writeHead(401);
        res.end(JSON.stringify({ error: { message: "bad token" } }));
        return;
      }
      if (url.includes("/search")) {
        res.end(JSON.stringify({ tracks: { items: [{ name: "Brano", artists: [{ name: "Artista" }], id: "t1" }] } }));
      } else if (url.includes("currently-playing")) {
        res.end(JSON.stringify({ is_playing: true, item: { name: "Brano", artists: [{ name: "Artista" }] }, device: { name: "phone" } }));
      } else if (url.includes("/pause") || url.includes("/play") || url.includes("/next")) {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(404);
        res.end("{}");
      }
    });
  });
  return new Promise<string>((res) => fake!.listen(0, "127.0.0.1", () => {
    res(`http://127.0.0.1:${(fake!.address() as any).port}`);
  }));
}

describe("google", () => {
  it("senza token: errore onesto", async () => {
    assert.equal((await google.gmailList()).ok, false);
    assert.equal((await google.gcalList()).ok, false);
  });
  it("gmail list + send", async () => {
    process.env["GOOGLE_API_BASE"] = await startFake();
    process.env["GOOGLE_TOKEN"] = "G";
    const l = await google.gmailList({ limit: 2 });
    assert.equal(l.ok, true);
    assert.equal(l.data!.messages.length, 2);
    assert.equal(l.data!.messages[0].subject, "Ciao");
    const s = await google.gmailSend("a@b.it", "Oggetto", "corpo");
    assert.equal(s.ok, true);
    assert.ok(posted.some((p) => p.raw));
  });
  it("calendar list + create", async () => {
    process.env["GOOGLE_API_BASE"] = await startFake();
    process.env["GOOGLE_TOKEN"] = "G";
    const l = await google.gcalList({ days: 1 });
    assert.equal(l.data!.events[0].summary, "Sync");
    const c = await google.gcalCreate("Riunione", "2026-02-01T10:00:00");
    assert.equal(c.ok, true);
    assert.equal(c.data!.id, "e1");
    const bad = await google.gcalCreate("", "non-data");
    assert.equal(bad.ok, false);
  });
});

describe("spotify", () => {
  it("search + state + control", async () => {
    process.env["SPOTIFY_API_BASE"] = await startFake();
    process.env["SPOTIFY_TOKEN"] = "S";
    const s = await spotify.search("brano");
    assert.equal(s.data!.tracks[0].artist, "Artista");
    const st = await spotify.state();
    assert.equal(st.data!.playing, true);
    assert.equal((await spotify.control("pause")).ok, true);
    assert.equal((await spotify.control("danza")).ok, false);
  });
});

describe("produttività nei tool", () => {
  it("gate: send/control chiedono conferma", async () => {
    const g = await runTool({ name: "gmail.send", args: { to: "a@b.it", subject: "s", text: "t" } });
    assert.equal(g.needsConfirm, true);
    const c = await runTool({ name: "gcal.create", args: { summary: "x", start: "2026-01-01" } });
    assert.equal(c.needsConfirm, true);
    const p = await runTool({ name: "spotify.control", args: { op: "play" } });
    assert.equal(p.needsConfirm, true);
    const st = await runTool({ name: "spotify.state", args: {} });
    assert.equal(st.ok, false); // senza token: errore onesto, non confirm
  });
});
