// Test cookbook: scan reale, recommend pura, serve contro Ollama finto.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { cookbook, recommend, type HwInfo } from "../src/modules/cookbook.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["OLLAMA_HOST", "OMNICORE_COOKBOOK_TIMEOUT_MS"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;

const hwBase: HwInfo = {
  os: "linux", arch: "arm64", cpu: "test", cores: 8,
  ramMB: 16000, freeMB: 8000, gpus: [], ollama: { reachable: true, models: ["llama3.1:8b"] },
};

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env["OLLAMA_HOST"] = "http://127.0.0.1:1";
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

function startOllama(tags: string[] = []): Promise<string> {
  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/tags") {
        res.end(JSON.stringify({ models: tags.map((name) => ({ name })) }));
      } else if (req.url === "/api/pull") {
        res.write('{"status":"pulling"}\n');
        res.end('{"status":"success"}\n');
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

describe("cookbook scan/recommend", () => {
  it("scan reale: campi presenti, ram > 0", async () => {
    const r = await cookbook.scan();
    assert.equal(r.ok, true);
    assert.ok(r.hw.ramMB > 0);
    assert.ok(r.hw.cores >= 0 && typeof r.hw.os === "string" && r.hw.os.length > 0);
    assert.equal(r.hw.ollama.reachable, false); // OLLAMA_HOST chiuso nel test
  });
  it("recommend: fit 100 sopra soglia, installati flaggati", () => {
    const recs = recommend(hwBase);
    const llama = recs.find((r) => r.model === "llama3.1:8b")!;
    assert.equal(llama.fits, true);
    assert.equal(llama.score, 100);
    assert.equal(llama.installed, true);
    const big = recs.find((r) => r.model === "llama3.1:70b")!;
    assert.equal(big.fits, false);
    assert.ok(big.score < 100);
    assert.ok(recs[0].score >= recs[recs.length - 1].score);
  });
  it("recommend: poca ram abbassa gli score", () => {
    const recs = recommend({ ...hwBase, ramMB: 2000 });
    assert.ok(recs.find((r) => r.model === "llama3.1:8b")!.score < 100);
  });
});

describe("cookbook serve", () => {
  it("senza ollama: errore onesto con hint", async () => {
    const r = await cookbook.serve("llama3.1:8b");
    assert.equal(r.ok, false);
    assert.match(r.detail, /Ollama/);
  });
  it("pull + tags contro Ollama finto", async () => {
    process.env["OLLAMA_HOST"] = await startOllama(["llama3.1:8b"]);
    const r = await cookbook.serve("llama3.1:8b");
    assert.equal(r.ok, true, r.detail);
    assert.match(r.detail, /OMNICORE_LLM_LOCAL_MODEL/);
  });
});

describe("cookbook nei tool", () => {
  it("scan/recommend via tool, serve chiede conferma", async () => {
    const s = await runTool({ name: "cookbook.scan", args: {} });
    assert.equal(s.ok, true);
    const r = await runTool({ name: "cookbook.recommend", args: {} });
    assert.equal(r.ok, true);
    assert.ok(Array.isArray(r.data));
    const v = await runTool({ name: "cookbook.serve", args: { model: "x" } });
    assert.equal(v.needsConfirm, true);
  });
});
