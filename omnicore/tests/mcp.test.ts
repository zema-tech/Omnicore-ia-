// Test client MCP: stdio + http contro server finti, lifecycle, confirm gate.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mcp } from "../src/modules/mcp.ts";
import { runTool } from "../src/agent/tools.ts";
import { verifyLocal } from "../src/decide/rules.ts";

const KEYS = ["OMNICORE_MCP_SERVERS", "OMNICORE_MCP_TIMEOUT_MS"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;

const STDIO_SCRIPT = `const rl=require('readline').createInterface({input:process.stdin});
rl.on('line',(l)=>{let m;try{m=JSON.parse(l)}catch{return};if(m.id===undefined)return;let r={};
if(m.method==='initialize')r={protocolVersion:'2024-11-05',capabilities:{},serverInfo:{name:'eco',version:'1'}};
else if(m.method==='tools/list')r={tools:[{name:'eco',description:'rimbalza testo',inputSchema:{type:'object'}}]};
else if(m.method==='tools/call')r={content:[{type:'text',text:'eco:'+JSON.stringify((m.params||{}).arguments||{})}]};
process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:r})+'\\n')});`;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env["OMNICORE_MCP_TIMEOUT_MS"] = "5000";
});

afterEach(async () => {
  mcp.stop();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  if (fake) {
    await new Promise<void>((res) => fake!.close(() => res()));
    fake = null;
  }
});

function startHttp(): Promise<string> {
  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      let m: any = {};
      try { m = JSON.parse(body || "{}"); } catch { /* noop */ }
      let result: any = {};
      if (m.method === "tools/list") result = { tools: [{ name: "somma", description: "somma a+b" }] };
      else if (m.method === "tools/call") {
        const a = m.params?.arguments ?? {};
        result = { content: [{ type: "text", text: String(Number(a.a ?? 0) + Number(a.b ?? 0)) }] };
      }
      res.end(JSON.stringify({ jsonrpc: "2.0", id: m.id ?? 1, result }));
    });
  });
  return new Promise<string>((res) => fake!.listen(0, "127.0.0.1", () => {
    res(`http://127.0.0.1:${(fake!.address() as any).port}/mcp`);
  }));
}

describe("mcp stdio", () => {
  it("list scopre tool e call rimbalza", async () => {
    process.env["OMNICORE_MCP_SERVERS"] = JSON.stringify([
      { name: "eco", transport: "stdio", command: "node", args: ["-e", STDIO_SCRIPT] },
    ]);
    const l = await mcp.list();
    assert.equal(l.ok, true);
    assert.equal(l.servers!.length, 1);
    assert.equal(l.servers![0].running, true);
    assert.ok(l.servers![0].tools.some((t) => t.name === "eco"));
    const c = await mcp.call("eco", "eco", { testo: "ciao" });
    assert.equal(c.ok, true, JSON.stringify(c).slice(0, 200));
    assert.match(JSON.stringify(c.data), /ciao/);
  });
  it("server sconosciuto o comando rotto: errore onesto", async () => {
    process.env["OMNICORE_MCP_SERVERS"] = JSON.stringify([
      { name: "rotto", transport: "stdio", command: "omnicore-comando-che-non-esiste-xyz" },
    ]);
    const c = await mcp.call("rotto", "x", {});
    assert.equal(c.ok, false);
    const u = await mcp.call("fantasma", "x", {});
    assert.equal(u.ok, false);
    assert.match(u.error!, /non configurato/);
  });
});

describe("mcp http", () => {
  it("list + call via POST", async () => {
    const url = await startHttp();
    process.env["OMNICORE_MCP_SERVERS"] = JSON.stringify([{ name: "calco", transport: "http", url }]);
    const l = await mcp.list();
    assert.ok(l.servers!.some((s) => s.tools.some((t) => t.name === "somma")));
    const c = await mcp.call("calco", "somma", { a: 20, b: 22 });
    assert.equal(c.ok, true);
    assert.match(JSON.stringify(c.data), /42/);
  });
});

describe("mcp nel loop", () => {
  it("senza conferma: proposto, server mai avviato", async () => {
    process.env["OMNICORE_MCP_SERVERS"] = JSON.stringify([
      { name: "eco", transport: "stdio", command: "node", args: ["-e", STDIO_SCRIPT] },
    ]);
    const r = await runTool({ name: "mcp.call", args: { server: "eco", tool: "eco" } });
    assert.equal(r.ok, false);
    assert.equal(r.needsConfirm, true);
  });
  it("decide: distruttivo senza conferma", () => {
    assert.equal(verifyLocal({ name: "mcp.call" as const, args: {} }, {}).verdict, "review");
  });
  it("stop ferma i server", async () => {
    process.env["OMNICORE_MCP_SERVERS"] = JSON.stringify([
      { name: "eco", transport: "stdio", command: "node", args: ["-e", STDIO_SCRIPT] },
    ]);
    await mcp.call("eco", "eco", {});
    const s = mcp.stop();
    assert.ok(s.stopped.includes("eco"));
  });
});
