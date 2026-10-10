// Test web.search: DDG html + Exa + fallback, contro server finti.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { webSearch } from "../src/modules/websearch.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["OMNICORE_DDG_BASE", "OMNICORE_EXA_BASE", "EXA_API_KEY", "OMNICORE_WEBSEARCH_TIMEOUT_MS"];
let saved: Record<string, string | undefined> = {};
let ddg: Server | null = null;
let exa: Server | null = null;
let exaMode = "ok";

const DDG_HTML = `<html><body>
<a class="result__a" href="https://esempio.it/uno">Primo risultato</a>
<a class="result__snippet" href="x">snippet uno parla di gatti</a>
<a class="result__a" href="https://esempio.it/due">Secondo risultato</a>
<a class="result__snippet" href="x">snippet due parla di cani</a>
</body></html>`;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env["OMNICORE_WEBSEARCH_TIMEOUT_MS"] = "4000";
});

afterEach(async () => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  for (const s of [ddg, exa]) {
    if (s) await new Promise<void>((res) => s!.close(() => res()));
  }
  ddg = exa = null;
});

function startDdg(): Promise<string> {
  ddg = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(DDG_HTML);
  });
  return new Promise<string>((res) => ddg!.listen(0, "127.0.0.1", () => {
    res(`http://127.0.0.1:${(ddg!.address() as any).port}`);
  }));
}

function startExa(): Promise<string> {
  exa = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (exaMode !== "ok" || req.headers["x-api-key"] !== "K") {
        res.writeHead(exaMode === "ok" ? 401 : 500);
        res.end(JSON.stringify({ error: "nope" }));
        return;
      }
      res.end(JSON.stringify({ results: [{ title: "Exa Uno", url: "https://exa.it/1", text: "testo exa rilevante", publishedDate: "2026-01-02" }] }));
    });
  });
  return new Promise<string>((res) => exa!.listen(0, "127.0.0.1", () => {
    res(`http://127.0.0.1:${(exa!.address() as any).port}`);
  }));
}

describe("websearch ddg", () => {
  it("parsa titoli, url e snippet", async () => {
    process.env["OMNICORE_DDG_BASE"] = await startDdg();
    const r = await webSearch("gatti", { provider: "ddg" });
    assert.equal(r.ok, true);
    assert.equal(r.provider, "ddg");
    assert.equal(r.results.length, 2);
    assert.equal(r.results[0].title, "Primo risultato");
    assert.equal(r.results[0].url, "https://esempio.it/uno");
    assert.match(r.results[0].snippet, /gatti/);
  });
  it("query vuota: errore onesto", async () => {
    const r = await webSearch("   ", { provider: "ddg" });
    assert.equal(r.ok, false);
  });
});

describe("websearch exa + fallback", () => {
  it("exa con key: risultati con data", async () => {
    process.env["OMNICORE_EXA_BASE"] = await startExa();
    process.env["EXA_API_KEY"] = "K";
    const r = await webSearch("test", { provider: "exa" });
    assert.equal(r.ok, true);
    assert.equal(r.results[0].date, "2026-01-02");
  });
  it("exa rotto -> fallback ddg", async () => {
    process.env["OMNICORE_EXA_BASE"] = await startExa();
    process.env["EXA_API_KEY"] = "K";
    process.env["OMNICORE_DDG_BASE"] = await startDdg();
    exaMode = "ko";
    try {
      const r = await webSearch("gatti");
      assert.equal(r.ok, true);
      assert.equal(r.provider, "ddg");
    } finally {
      exaMode = "ok";
    }
  });
});

describe("websearch nel loop", () => {
  it("tool web.search via ddg finto", async () => {
    process.env["OMNICORE_DDG_BASE"] = await startDdg();
    const r = await runTool({ name: "web.search", args: { query: "cani" } });
    assert.equal(r.ok, true);
    assert.ok((r.data as any[]).some((h) => h.url.includes("esempio.it")));
  });
});
