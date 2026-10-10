// Test integrazione server+dashboard: pagina, status/doctor, stream SSE con sessione.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";

const PORT = 8135;
const BASE = `http://127.0.0.1:${PORT}`;
const HEADERS = { "Content-Type": "application/json", Authorization: "Bearer t" };
let srv: ChildProcess | null = null;

async function waitUp(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* non ancora su */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server non partito");
}

before(async () => {
  srv = spawn("python3", ["server.py", "--port", String(PORT)], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, OMNICORE_API_TOKEN: "t", OLLAMA_HOST: "http://127.0.0.1:1", HERMES_PYTHON: "/nonexistent-xyz" },
    stdio: "ignore",
  });
  await waitUp();
});

after(() => {
  try {
    srv?.kill("SIGKILL");
  } catch { /* già morto */ }
  srv = null;
});

describe("dashboard server", () => {
  it("401 senza token", async () => {
    const r = await fetch(`${BASE}/api/status`);
    assert.equal(r.status, 401);
  });
  it("pagina con chat live e stato", async () => {
    const r = await fetch(`${BASE}/`, { headers: { Authorization: "Bearer t" } });
    const html = await r.text();
    assert.ok(html.includes("/api/chat/stream"));
    assert.ok(html.includes("codetimeline"));
    assert.ok(html.includes("/api/status"));
  });
  it("status: cervello + budget, mai segreti", async () => {
    const r = await fetch(`${BASE}/api/status`, { headers: HEADERS });
    const j = (await r.json()) as any;
    assert.equal(j.service, "omnicore");
    assert.ok(typeof j.brain === "string");
    assert.ok(typeof j.budget.used === "number");
    assert.ok(!JSON.stringify(j).toLowerCase().includes("api_key") && !JSON.stringify(j).includes("Bearer"));
  });
  it("doctor: active tra api/local/euristica", async () => {
    const r = await fetch(`${BASE}/api/doctor`, { headers: HEADERS });
    const j = (await r.json()) as any;
    assert.ok(["api", "local", "euristica"].includes(j.active));
  });
  it("stream SSE: eventi + result + sessione loggata", { timeout: 150000 }, async () => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 140000);
    try {
      const r = await fetch(`${BASE}/api/chat/stream`, {
        method: "POST", headers: HEADERS, body: JSON.stringify({ text: "ciao" }), signal: ctl.signal,
      });
      assert.equal(r.headers.get("content-type")?.includes("text/event-stream"), true);
      const text = await r.text();
      assert.ok(text.includes('"event":"token"') || text.includes('"event":"result"') || text.includes("tool_start"));
      assert.match(text, /"event":"result"/);
      const sid = text.match(/: session (\S+)/)?.[1];
      assert.ok(sid, "manca commento sessione");
      const s = await fetch(`${BASE}/api/sessions`, { headers: HEADERS });
      const list = (await s.json()) as any[];
      assert.ok(list.some((x) => x.id === sid));
    } finally {
      clearTimeout(t);
    }
  });
  it("abort: sid ignoto onesto, turno in corso killato", { timeout: 90000 }, async () => {
    const no = await fetch(`${BASE}/api/chat/abort`, {
      method: "POST", headers: HEADERS, body: JSON.stringify({ session_id: "mai-esistita" }),
    });
    assert.equal(((await no.json()) as any).ok, false);
    const sid = `abort-${Date.now()}`;
    const pending = fetch(`${BASE}/api/chat/stream`, {
      method: "POST", headers: HEADERS, body: JSON.stringify({ text: "ciao", session_id: sid }),
    });
    await new Promise((r) => setTimeout(r, 300));
    const ab = await fetch(`${BASE}/api/chat/abort`, {
      method: "POST", headers: HEADERS, body: JSON.stringify({ session_id: sid }),
    });
    assert.equal(((await ab.json()) as any).ok, true);
    const text = await (await pending).text();
    assert.ok(!text.includes('"event":"result"'), "dopo abort niente result");
  });
});
