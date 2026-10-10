// Test MCP server mode: vero client JSON-RPC contro `npm run mcp-serve`.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";

let srv: ChildProcess | null = null;
let seq = 0;
let buf = "";
const pending = new Map<number, (v: any) => void>();

function send(method: string, params: any = {}, id?: number): Promise<any> {
  return new Promise((resolve) => {
    const myId = id ?? ++seq;
    pending.set(myId, resolve);
    srv!.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
    setTimeout(() => {
      if (pending.delete(myId)) resolve({ __timeout: true });
    }, 15000);
  });
}

before(async () => {
  srv = spawn("node", ["--experimental-strip-types", "src/mcp-serve.ts"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, OLLAMA_HOST: "http://127.0.0.1:1" },
  });
  srv.stdout!.on("data", (d) => {
    buf += String(d);
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        const m = JSON.parse(l);
        const p = pending.get(Number(m.id));
        if (p) {
          pending.delete(Number(m.id));
          p(m);
        }
      } catch { /* ignora */ }
    }
  });
  const hello: any = await send("initialize", { protocolVersion: "2024-11-05" });
  assert.equal(hello.result.serverInfo.name, "omnicore");
});

after(() => {
  try {
    srv?.kill("SIGKILL");
  } catch { /* già morto */ }
  srv = null;
});

describe("mcp server", () => {
  it("tools/list espone il catalogo", async () => {
    const r: any = await send("tools/list");
    assert.ok(!r.__timeout);
    const names = r.result.tools.map((t: any) => t.name);
    for (const n of ["memory.search", "code.grep", "web.fetch", "skills.list", "budget.status"]) {
      assert.ok(names.includes(n), `manca: ${n}`);
    }
    assert.ok(!names.includes("respond"));
  });
  it("tools/call esegue tool sicuri", async () => {
    const r: any = await send("tools/call", { name: "budget.status", arguments: {} });
    assert.ok(r.result.content[0].text.includes("usedTokens") || r.result.content[0].text.includes("used"));
    assert.equal(r.result.isError, undefined);
  });
  it("tools/call distruttivo senza confirm: needsConfirm strutturato", async () => {
    const r: any = await send("tools/call", { name: "code.shell", arguments: { cmd: "echo x" } });
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0].text, /needsConfirm/);
  });
  it("tools/call ignoto: errore JSON-RPC", async () => {
    const r: any = await send("tools/call", { name: "fantasma", arguments: {} });
    assert.ok(r.error);
  });
  it("resources: sessions, skills, doctor", async () => {
    const l: any = await send("resources/list");
    const uris = l.result.resources.map((x: any) => x.uri);
    assert.ok(uris.includes("omnicore://skills"));
    const s: any = await send("resources/read", { uri: "omnicore://skills" });
    assert.ok(JSON.parse(s.result.contents[0].text).length >= 30);
    const d: any = await send("resources/read", { uri: "omnicore://doctor" });
    assert.ok(["api", "local", "euristica"].includes(JSON.parse(d.result.contents[0].text).active));
  });
});
