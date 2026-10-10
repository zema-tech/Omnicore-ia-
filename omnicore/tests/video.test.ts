// Test video.generate: FAL finto (submit→poll→download), key, confirm.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { video } from "../src/modules/video.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["FAL_KEY", "FAL_API_BASE", "FAL_VIDEO_MODEL", "OMNICORE_VIDEO_TIMEOUT_MS", "OMNICORE_WORKSPACE"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;
let ws = "";
let polls = 0;

const BYTES = Buffer.from([0, 0, 0, 1, 2, 3, 4, 5]);

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  ws = mkdtempSync(join(tmpdir(), "video-test-"));
  process.env["OMNICORE_WORKSPACE"] = ws;
  polls = 0;
});

afterEach(async () => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(ws, { recursive: true, force: true });
  if (fake) {
    await new Promise<void>((res) => fake!.close(() => res()));
    fake = null;
  }
});

function startFal(): Promise<string> {
  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      if (req.url === "/v.mp4") {
        res.setHeader("Content-Type", "video/mp4");
        res.end(BYTES);
        return;
      }
      res.setHeader("Content-Type", "application/json");
      if ((req.headers["authorization"] ?? "") !== "Key K") {
        res.writeHead(401);
        res.end(JSON.stringify({ detail: "unauthorized" }));
        return;
      }
      if (req.method === "POST") {
        res.end(JSON.stringify({ request_id: "r1" }));
      } else if (req.url?.includes("/status")) {
        polls++;
        if (polls < 2) res.end(JSON.stringify({ status: "IN_PROGRESS" }));
        else res.end(JSON.stringify({ status: "COMPLETED", video: { url: `http://127.0.0.1:${(fake!.address() as any).port}/v.mp4` } }));
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

describe("video.generate", () => {
  it("senza key: errore onesto", async () => {
    const r = await video.generate({ prompt: "un gatto" });
    assert.equal(r.ok, false);
    assert.match(r.error!, /FAL_KEY/);
  });
  it("submit→poll→download nel workspace", async () => {
    process.env["FAL_API_BASE"] = await startFal();
    process.env["FAL_KEY"] = "K";
    const r = await video.generate({ prompt: "un gatto che dorme", filename: "gatto.mp4", pollMs: 100 });
    assert.equal(r.ok, true, r.error ?? "");
    assert.equal(r.file, "gatto.mp4");
    assert.ok(existsSync(join(ws, "gatto.mp4")));
    assert.deepEqual([...readFileSync(join(ws, "gatto.mp4"))].slice(0, 8), [...BYTES]);
  });
  it("tool senza conferma: proposto (a pagamento)", async () => {
    const r = await runTool({ name: "video.generate", args: { prompt: "x" } });
    assert.equal(r.ok, false);
    assert.equal(r.needsConfirm, true);
  });
});
