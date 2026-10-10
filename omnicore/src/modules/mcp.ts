// Modulo MCP — client Model Context Protocol nativo (da studio Hermes/OpenCode).
// Trasporti: stdio (spawn processo + JSON-RPC su stdin/stdout) e http
// (POST streamable, fallback SSE GET). Tool: mcp.list / mcp.call / mcp.reload.
// Config: OMNICORE_MCP_SERVERS (JSON) oppure omnicore/.mcp.json.
// Esecuzione server terzi = distruttivo: i tool vogliono conferma (decide).
// Zero dipendenze. Mai throw: sempre {ok, via, ...}.
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VIA = "mcp(native)";
const HERE = dirname(fileURLToPath(import.meta.url));

export interface McpStdioConf { name: string; transport: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
export interface McpHttpConf { name: string; transport: "http"; url: string; headers?: Record<string, string> }
export type McpConf = McpStdioConf | McpHttpConf;

export interface McpToolDef { name: string; description: string; inputSchema?: unknown }
export interface McpServerInfo { name: string; transport: string; running: boolean; tools: McpToolDef[] }

/** Configurazione: env JSON vince, poi omnicore/.mcp.json, poi vuoto. */
export function mcpConfig(): McpConf[] {
  const fromEnv = process.env["OMNICORE_MCP_SERVERS"] ?? "";
  if (fromEnv.trim()) {
    try {
      const j = JSON.parse(fromEnv);
      const arr = Array.isArray(j) ? j : Object.entries(j).map(([name, v]) => ({ name, ...(v as object) }));
      return arr.filter((s: any) => s && typeof s.name === "string").map(normalize);
    } catch { /* json rotto: prova file */ }
  }
  for (const p of [join(HERE, "..", "..", ".mcp.json"), join(HERE, "..", ".mcp.json")]) {
    try {
      if (existsSync(p)) {
        const j = JSON.parse(readFileSync(p, "utf8"));
        const arr = Array.isArray(j?.servers) ? j.servers : Array.isArray(j) ? j : [];
        return arr.filter((s: any) => s && typeof s.name === "string").map(normalize);
      }
    } catch { /* ignora e continua */ }
  }
  return [];
}

function normalize(s: any): McpConf {
  if (s.transport === "http" || s.url) {
    return { name: String(s.name), transport: "http", url: String(s.url ?? ""), headers: s.headers };
  }
  return { name: String(s.name), transport: "stdio", command: String(s.command ?? ""), args: (s.args ?? []).map(String), env: s.env };
}

function timeoutMs(): number {
  return Number(process.env["OMNICORE_MCP_TIMEOUT_MS"] ?? "15000");
}

interface Session {
  conf: McpConf;
  child?: ChildProcess;
  buf?: string;
  pending?: Map<number, { res: (v: any) => void; rej: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>;
  seq?: number;
  tools?: McpToolDef[];
}

const sessions = new Map<string, Session>();

function rpcError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e).slice(0, 200));
}

function sendStdio(s: Session, method: string, params?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!s.child?.stdin) return reject(new Error("stdio non collegato"));
    const id = (s.seq = (s.seq ?? 0) + 1);
    const timer = setTimeout(() => {
      s.pending?.delete(id);
      reject(new Error(`mcp timeout su ${method}`));
    }, timeoutMs());
    s.pending!.set(id, { res: resolve, rej: reject, timer });
    try {
      s.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }) + "\n");
    } catch (e) {
      clearTimeout(timer);
      s.pending!.delete(id);
      reject(rpcError(e));
    }
  });
}

function onStdioLine(s: Session, line: string): void {
  let msg: any;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg?.id === undefined || !s.pending) return; // notifica: ignorata
  const p = s.pending.get(Number(msg.id));
  if (!p) return;
  s.pending.delete(Number(msg.id));
  clearTimeout(p.timer);
  if (msg.error) p.rej(new Error(`mcp: ${String(msg.error?.message ?? msg.error).slice(0, 200)}`));
  else p.res(msg.result);
}

async function startStdio(conf: McpStdioConf): Promise<Session> {
  const old = sessions.get(conf.name);
  if (old?.child && old.child.exitCode === null) return old;
  stopSession(conf.name);
  const child = spawn(conf.command, conf.args ?? [], {
    env: { ...process.env, ...(conf.env ?? {}) },
    stdio: ["pipe", "pipe", "ignore"],
  });
  const s: Session = { conf, child, buf: "", pending: new Map(), seq: 0 };
  sessions.set(conf.name, s);
  child.stdout?.on("data", (d: unknown) => {
    s.buf = (s.buf ?? "") + String(d);
    const lines = s.buf.split("\n");
    s.buf = lines.pop() ?? "";
    for (const l of lines) if (l.trim()) onStdioLine(s, l);
  });
  child.on("error", (e) => {
    for (const [, p] of s.pending ?? []) {
      clearTimeout(p.timer);
      p.rej(e);
    }
    s.pending?.clear();
  });
  const exited = new Promise<string>((res) => {
    const t = setTimeout(() => res(""), 10000);
    child.on("exit", (code) => {
      clearTimeout(t);
      res(`exit ${code}`);
    });
  });
  // handshake (race con exit immediata = comando rotto)
  const hello = (async () => {
    await sendStdio(s, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "omnicore", version: "0.3" },
    });
    try {
      s.child?.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    } catch { /* best-effort */ }
  })();
  const dead = await Promise.race([hello.then(() => ""), exited]);
  if (dead) {
    stopSession(conf.name);
    throw new Error(`server mcp uscito subito (${dead}): ${conf.command}`);
  }
  return s;
}

async function callHttp(conf: McpHttpConf, method: string, params?: unknown): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs());
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(conf.headers ?? {}) };
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? {} });
    let r = await fetch(conf.url, { method: "POST", headers, body, signal: ctl.signal });
    let text = await r.text().catch(() => "");
    if (!r.ok && (r.status === 404 || r.status === 405)) {
      // fallback SSE GET (server vecchi)
      r = await fetch(conf.url, { headers: { Accept: "text/event-stream", ...(conf.headers ?? {}) }, signal: ctl.signal });
      text = await r.text().catch(() => "");
      const data = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      const j = JSON.parse(data || "null") as any;
      if (j?.error) throw new Error(`mcp: ${String(j.error?.message ?? j.error).slice(0, 200)}`);
      return j?.result;
    }
    // streamable: può essere JSON diretto o SSE
    let j: any = null;
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) j = JSON.parse(trimmed);
    else {
      const data = trimmed.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      j = JSON.parse(data || "null");
    }
    if (!r.ok || j?.error) throw new Error(`mcp: ${String(j?.error?.message ?? `http ${r.status}`).slice(0, 200)}`);
    return j?.result;
  } finally {
    clearTimeout(t);
  }
}

function stopSession(name: string): void {
  const s = sessions.get(name);
  sessions.delete(name);
  try {
    s?.child?.kill("SIGKILL");
  } catch { /* già morto */ }
  for (const [, p] of s?.pending ?? []) {
    clearTimeout(p.timer);
    p.rej(new Error("server mcp fermato"));
  }
  s?.pending?.clear();
}

/** Ferma uno o tutti i server. */
export function mcpStop(name?: string): { stopped: string[] } {
  if (name) {
    stopSession(name);
    return { stopped: [name] };
  }
  const all = [...sessions.keys()];
  for (const n of all) stopSession(n);
  return { stopped: all };
}

async function serverTools(conf: McpConf): Promise<McpToolDef[]> {
  if (conf.transport === "http") {
    try {
      await callHttp(conf, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "omnicore", version: "0.3" } });
    } catch { /* handshake best-effort su http */ }
    const res = await callHttp(conf, "tools/list", {});
    const tools = res?.tools ?? res ?? [];
    return (Array.isArray(tools) ? tools : []).map((t: any) => ({
      name: String(t?.name ?? ""),
      description: String(t?.description ?? "").slice(0, 200),
      inputSchema: t?.inputSchema,
    })).filter((t) => t.name);
  }
  if (!conf.command) throw new Error(`server ${conf.name}: manca command`);
  const s = await startStdio(conf);
  if (s.tools) return s.tools;
  const res = await sendStdio(s, "tools/list", {});
  const tools = res?.tools ?? [];
  s.tools = (Array.isArray(tools) ? tools : []).map((t: any) => ({
    name: String(t?.name ?? ""),
    description: String(t?.description ?? "").slice(0, 200),
    inputSchema: t?.inputSchema,
  })).filter((t) => t.name);
  return s.tools;
}

/** Server configurati + tool scoperti (avvia i server, fallisce onesto). */
export async function mcpList(): Promise<{ ok: boolean; via: string; servers?: McpServerInfo[]; error?: string }> {
  const confs = mcpConfig();
  const servers: McpServerInfo[] = [];
  for (const c of confs) {
    try {
      const tools = await serverTools(c);
      servers.push({ name: c.name, transport: c.transport, running: true, tools });
    } catch {
      servers.push({ name: c.name, transport: c.transport, running: false, tools: [] });
    }
  }
  return { ok: true, via: VIA, servers };
}

/** Chiama un tool MCP {server, tool, args}. */
export async function mcpCall(server: string, tool: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; via: string; data?: unknown; error?: string }> {
  const conf = mcpConfig().find((c) => c.name === server);
  if (!conf) return { ok: false, via: VIA, error: `server mcp non configurato: ${server}` };
  try {
    if (conf.transport === "http") {
      const res = await callHttp(conf, "tools/call", { name: tool, arguments: args });
      return { ok: true, via: `${VIA}(http)`, data: res };
    }
    const s = await startStdio(conf);
    const res = await sendStdio(s, "tools/call", { name: tool, arguments: args });
    return { ok: true, via: `${VIA}(stdio)`, data: res };
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 300) };
  }
}

export const mcp = { config: mcpConfig, list: mcpList, call: mcpCall, stop: mcpStop };
