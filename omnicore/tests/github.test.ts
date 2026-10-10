// Test github.read: issues/pulls/commits/diff contro API finta.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { github } from "../src/modules/github.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["GITHUB_API_BASE", "GITHUB_TOKEN", "OMNICORE_GITHUB_TIMEOUT_MS"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;
let lastAuth = "";

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  lastAuth = "";
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
    lastAuth = String(req.headers["authorization"] ?? "");
    const url = req.url ?? "";
    if (url.includes("/pulls/") && req.headers["accept"]?.includes("diff")) {
      res.setHeader("Content-Type", "text/plain");
      res.end("diff --git a/f.ts b/f.ts\n+nuova riga\n");
      return;
    }
    res.setHeader("Content-Type", "application/json");
    if (url.includes("/commits")) {
      res.end(JSON.stringify([{ sha: "abc123def456", commit: { message: "fix bug", author: { date: "2026-01-01" } } }]));
    } else if (url.includes("/pulls")) {
      res.end(JSON.stringify([{ number: 7, title: "Aggiunge feature", state: "open", user: { login: "zem" }, labels: [], html_url: "http://x/7" }]));
    } else if (url.includes("/issues")) {
      res.end(JSON.stringify([{ number: 3, title: "Bug login", state: "open", user: { login: "ana" }, labels: [{ name: "bug" }], comments: 2, html_url: "http://x/3" }]));
    } else {
      res.writeHead(404);
      res.end("{}");
    }
  });
  return new Promise<string>((res) => fake!.listen(0, "127.0.0.1", () => {
    res(`http://127.0.0.1:${(fake!.address() as any).port}`);
  }));
}

describe("github.read", () => {
  it("issues con metadati e token inviato", async () => {
    process.env["GITHUB_API_BASE"] = await startFake();
    process.env["GITHUB_TOKEN"] = "T";
    const r = await github.read("acme/app", "issues");
    assert.equal(r.ok, true);
    assert.equal((r.data as any[])[0].title, "Bug login");
    assert.deepEqual((r.data as any[])[0].labels, ["bug"]);
    assert.equal(lastAuth, "Bearer T");
  });
  it("pulls, commits e diff", async () => {
    process.env["GITHUB_API_BASE"] = await startFake();
    const p = await github.read("acme/app", "pulls");
    assert.equal((p.data as any[])[0].number, 7);
    const c = await github.read("acme/app", "commits", { limit: 1 });
    assert.equal((c.data as any[])[0].sha, "abc123def456");
    const d = await github.read("acme/app", "diff", { number: 7 });
    assert.match(String((d.data as any).diff), /nuova riga/);
  });
  it("repo invalido e diff senza number: errori onesti", async () => {
    const b = await github.read("nonvalido", "issues");
    assert.equal(b.ok, false);
    const d = await github.read("a/b", "diff", {});
    assert.equal(d.ok, false);
  });
  it("tool nel loop", async () => {
    process.env["GITHUB_API_BASE"] = await startFake();
    const r = await runTool({ name: "github.read", args: { repo: "acme/app", type: "issues" } });
    assert.equal(r.ok, true);
  });
});
