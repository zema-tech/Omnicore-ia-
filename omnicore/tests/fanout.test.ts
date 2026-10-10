// Test fanout multi-agente: paralleli, routing ruolo, sessioni figlie, confirm.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agents } from "../src/modules/agents.ts";
import { readMessages } from "../src/modules/sessions.ts";
import { runTool } from "../src/agent/tools.ts";

let dir = "";
let ws = "";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ["OMNICORE_AGENTS_FILE", "OMNICORE_WORKSPACE", "OMNICORE_SESSIONS_FILE"]) saved[k] = process.env[k];
  dir = mkdtempSync(join(tmpdir(), "fanout-test-"));
  ws = mkdtempSync(join(tmpdir(), "fanout-ws-"));
  process.env["OMNICORE_AGENTS_FILE"] = join(dir, "agents.json");
  process.env["OMNICORE_WORKSPACE"] = ws;
  process.env["OMNICORE_SESSIONS_FILE"] = join(dir, "sessions.json");
});

afterEach(() => {
  for (const k of ["OMNICORE_AGENTS_FILE", "OMNICORE_WORKSPACE", "OMNICORE_SESSIONS_FILE"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
  rmSync(ws, { recursive: true, force: true });
});

describe("agents.fanout", () => {
  it("senza conferma: proposto, niente esecuzione", async () => {
    const r = await runTool({ name: "agents.fanout", args: { items: [{ role: "code", task: "x" }] } });
    assert.equal(r.ok, false);
    assert.equal(r.needsConfirm, true);
  });
  it("items invalidi: errore onesto", async () => {
    const r = await runTool({ name: "agents.fanout", args: { items: [{ task: "  " }], confirm: true } });
    assert.equal(r.ok, false);
    assert.match(r.error!, /items/);
  });
  it("due code-task paralleli + sessioni figlie con parent", async () => {
    const r = await runTool({
      name: "agents.fanout",
      args: {
        confirm: true,
        items: [
          { role: "code", task: "crea uno.txt con contenuto uno" },
          { role: "code", task: "crea due.txt con contenuto due" },
        ],
      },
    }, { directory: ws });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
    const rep = r.data as any;
    assert.equal(rep.results.length, 2);
    assert.ok(rep.summary.includes("2/2 ok"));
    assert.ok(existsSync(join(ws, "uno.txt")));
    assert.ok(existsSync(join(ws, "due.txt")));
    for (const item of rep.results) {
      const msgs = readMessages(item.session);
      assert.ok(msgs.some((m) => (m as any).parent === rep.run && (m as any).role === "subagent"));
    }
  });
  it("agente registrato nel fanout + ops senza effetti", async () => {
    agents.register("filebot", []);
    const r = await runTool({
      name: "agents.fanout",
      args: { confirm: true, items: [{ agent: "filebot", task: "crea tre.txt con contenuto tre" }, { role: "ops", task: "controlla stato" }] },
    }, { directory: ws });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
    assert.ok(existsSync(join(ws, "tre.txt")));
  });
});
