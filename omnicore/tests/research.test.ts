// Test deep research: pipeline cerca→leggi→sintesi→report contro server finti.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { research } from "../src/modules/research.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["OMNICORE_DDG_BASE", "EXA_API_KEY", "OMNICORE_WEB_ALLOW_LOCAL",
  "OMNICORE_VAULT_DIR", "OMNICORE_LLM_BASE_URL", "OMNICORE_LLM_MODEL", "OLLAMA_HOST",
  "OMNICORE_LLM_TIMEOUT"];
let saved: Record<string, string | undefined> = {};
let ddg: Server | null = null;
let pages: Server | null = null;
let dir = "";
let ddgPort = 0;
let pagePort = 0;

const DDG_HTML = `<html><body>
<a class="result__a" href="http://127.0.0.1:PORT/p1">Guida gatti</a>
<a class="result__snippet" href="x">tutto sui gatti domestici</a>
<a class="result__a" href="http://127.0.0.1:PORT/p2">Gatti famosi</a>
<a class="result__snippet" href="x">gatti che hanno fatto storia</a>
</body></html>`;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), "research-test-"));
  process.env["OMNICORE_VAULT_DIR"] = join(dir, "vault");
  process.env["OMNICORE_WEB_ALLOW_LOCAL"] = "1";
  process.env["OLLAMA_HOST"] = "http://127.0.0.1:1";
  process.env["OMNICORE_LLM_TIMEOUT"] = "2000";
});

afterEach(async () => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
  for (const s of [ddg, pages]) {
    if (s) await new Promise<void>((res) => s!.close(() => res()));
  }
  ddg = pages = null;
});

async function startPages(): Promise<void> {
  pages = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    const n = req.url === "/p2" ? "due" : "uno";
    res.end(`<html><head><title>Pagina ${n}</title></head><body><p>Contenuto lungo e significativo sulla cura dei gatti domestici, alimentazione e giochi quotidiani per il benessere.</p></body></html>`);
  });
  await new Promise<void>((res) => pages!.listen(0, "127.0.0.1", () => res()));
  pagePort = (pages!.address() as any).port;
  ddg = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(DDG_HTML.replaceAll("PORT", String(pagePort)));
  });
  await new Promise<void>((res) => ddg!.listen(0, "127.0.0.1", () => res()));
  ddgPort = (ddg!.address() as any).port;
  process.env["OMNICORE_DDG_BASE"] = `http://127.0.0.1:${ddgPort}`;
  void ddgPort;
}

describe("research.deep", () => {
  it("report con fonti, sintesi estrattiva e archivio vault", async () => {
    await startPages();
    const r = await research.deep("cura gatti", { maxSources: 4, depth: 2 });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
    assert.equal(r.report!.sources.length, 2);
    assert.ok(r.report!.markdown.includes("## Fonti"));
    assert.ok(r.report!.markdown.includes("Guida gatti"));
    assert.ok(r.report!.synthesis.length > 20);
    assert.ok(r.report!.file && existsSync(r.report!.file));
    assert.ok(readdirSync(join(dir, "vault")).length >= 1);
  });
  it("query vuota e ricerca fallita: errori onesti", async () => {
    const e = await research.deep("   ");
    assert.equal(e.ok, false);
    process.env["OMNICORE_DDG_BASE"] = "http://127.0.0.1:1";
    const f = await research.deep("gatti");
    assert.equal(f.ok, false);
    assert.match(f.error!, /ricerca fallita/);
  });
  it("tool research.deep nel loop", async () => {
    await startPages();
    const r = await runTool({ name: "research.deep", args: { query: "cura gatti", depth: 1 } });
    assert.equal(r.ok, true);
    assert.ok((r.data as any).markdown.includes("# Ricerca"));
  });
});
