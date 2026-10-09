// Test browser nativo: anti-SSRF offline + fetch reale contro server finto locale.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { web } from "../src/modules/web.ts";
import { runTool } from "../src/agent/tools.ts";
import { planKeyword } from "../src/agent/plan.ts";

const KEYS = ["OMNICORE_WEB_ALLOW_LOCAL", "OMNICORE_WEB_TIMEOUT_MS"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;
let base = "";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
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

function startFake(): Promise<void> {
  fake = createServer((req, res) => {
    if (req.url === "/json") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ hello: "mondo" }));
      return;
    }
    if (req.url === "/r") {
      res.writeHead(302, { Location: "/pagina" });
      res.end();
      return;
    }
    if (req.url === "/loop") {
      res.writeHead(302, { Location: "/loop" });
      res.end();
      return;
    }
    if (req.url === "/404") {
      res.writeHead(404);
      res.end("nope");
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(`<html><head><title>Pagina Finta</title><script>var x=1;</script></head><body><h1>Ciao web</h1><p>testo di prova</p><a href="/altra">vai oltre</a></body></html>`);
  });
  return new Promise<void>((res) => fake!.listen(0, "127.0.0.1", () => {
    base = `http://127.0.0.1:${(fake!.address() as any).port}`;
    res();
  }));
}

describe("web anti-SSRF (offline)", () => {
  it("blocca localhost, ip privati, metadata, protocolli, credenziali", async () => {
    for (const u of [
      "http://localhost/x",
      "http://127.0.0.1/x",
      "http://10.0.0.1/x",
      "http://192.168.1.1/x",
      "http://169.254.169.254/x",
      "ftp://esempio.it/x",
      "http://user:pass@esempio.it/x",
      "non-un-url",
    ]) {
      const r = await web.fetch(u, { timeoutMs: 2000 });
      assert.equal(r.ok, false, `doveva bloccare: ${u}`);
      assert.ok(r.error && r.error.length > 0);
    }
  });
});

describe("web.fetch contro server finto", () => {
  it("html: titolo, testo senza script, link", async () => {
    process.env["OMNICORE_WEB_ALLOW_LOCAL"] = "1";
    await startFake();
    const r = await web.fetch(`${base}/pagina`);
    assert.equal(r.ok, true);
    assert.equal(r.page!.title, "Pagina Finta");
    assert.ok(r.page!.text.includes("Ciao web"));
    assert.ok(!r.page!.text.includes("var x=1"));
    assert.ok(r.page!.links.some((l) => l.text === "vai oltre"));
  });
  it("segue redirect e fallisce onesto su 404 e loop", async () => {
    process.env["OMNICORE_WEB_ALLOW_LOCAL"] = "1";
    await startFake();
    const ok = await web.fetch(`${base}/r`);
    assert.equal(ok.ok, true);
    assert.ok(ok.page!.finalUrl.endsWith("/pagina"));
    const nf = await web.fetch(`${base}/404`);
    assert.equal(nf.ok, false);
    assert.match(nf.error!, /http 404/);
    const loop = await web.fetch(`${base}/loop`, { timeoutMs: 3000 });
    assert.equal(loop.ok, false);
    assert.match(loop.error!, /redirect/);
  });
  it("json passato come testo", async () => {
    process.env["OMNICORE_WEB_ALLOW_LOCAL"] = "1";
    await startFake();
    const r = await web.fetch(`${base}/json`);
    assert.equal(r.ok, true);
    assert.ok(r.page!.text.includes("mondo"));
  });
});

describe("web tool nel loop", () => {
  it("web.fetch senza url: errore onesto", async () => {
    const r = await runTool({ name: "web.fetch", args: {} }, { text: "niente link qui" });
    assert.equal(r.ok, false);
    assert.match(r.error!, /url/);
  });
  it("planKeyword aggiunge web.fetch quando c'è un URL", () => {
    const p = planKeyword("leggi https://esempio.it/pagina e dimmi cosa dice");
    assert.ok(p.calls.some((c) => c.name === "web.fetch"));
  });
});
