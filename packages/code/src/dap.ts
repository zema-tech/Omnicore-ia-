// Client DAP generico via stdio — parla con debug adapter (debugpy, cpptools,
// mock) con framing Content-Length come LSP. Sessioni numerate: attach lancia
// e inizializza, poi break/go/vars/threads. Mai throw: {ok, ...}.
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { workspaceRoot } from "./workspace.ts";

export interface DapOpts {
  command: string;
  args?: string[];
  root?: string;
  timeoutMs?: number;
}

interface Pending { res: (v: any) => void; rej: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

interface Session {
  id: string;
  child: ChildProcess;
  seq: number;
  pending: Map<number, Pending>;
  buf: Buffer;
  timeout: number;
}

const sessions = new Map<string, Session>();
let counter = 0;

function encode(msg: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8"), body]);
}

function timeoutMs(): number {
  return Number(process.env["OMNICORE_DAP_TIMEOUT_MS"] ?? "15000");
}

function request(s: Session, command: string, args?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!s.child.stdin) return reject(new Error("adapter non collegato"));
    const seq = ++s.seq;
    const timer = setTimeout(() => {
      s.pending.delete(seq);
      reject(new Error(`dap timeout su ${command}`));
    }, s.timeout);
    s.pending.set(seq, { res: resolve, rej: reject, timer });
    try {
      s.child.stdin.write(encode({ seq, type: "request", command, arguments: args ?? {} }));
    } catch (e) {
      clearTimeout(timer);
      s.pending.delete(seq);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function onData(s: Session, d: Buffer): void {
  s.buf = Buffer.concat([s.buf, Buffer.from(d)]);
  for (;;) {
    const h = s.buf.indexOf("\r\n\r\n");
    if (h < 0) return;
    const m = s.buf.slice(0, h).toString("utf8").match(/Content-Length:\s*(\d+)/i);
    if (!m) {
      s.buf = s.buf.slice(h + 4);
      continue;
    }
    const len = Number(m[1]);
    if (s.buf.length < h + 4 + len) return;
    const body = s.buf.slice(h + 4, h + 4 + len).toString("utf8");
    s.buf = s.buf.slice(h + 4 + len);
    let msg: any;
    try {
      msg = JSON.parse(body);
    } catch {
      continue;
    }
    if (msg?.type !== "response" || typeof msg?.request_seq !== "number") continue; // eventi: ignorati
    const p = s.pending.get(Number(msg.request_seq));
    if (!p) continue;
    s.pending.delete(Number(msg.request_seq));
    clearTimeout(p.timer);
    if (msg.success === false) p.rej(new Error(`dap: ${String(msg.message ?? msg.command).slice(0, 160)}`));
    else p.res(msg.body ?? {});
  }
}

function kill(s: Session): void {
  try {
    s.child.kill("SIGKILL");
  } catch { /* già morto */ }
  for (const [, p] of s.pending) {
    clearTimeout(p.timer);
    p.rej(new Error("adapter fermato"));
  }
  s.pending.clear();
}

/** Lancia un debug adapter e lo inizializza. Ritorna session id. Mai throw. */
export async function dapAttach(opts: DapOpts): Promise<{ ok: boolean; session?: string; error?: string }> {
  if (!opts.command) return { ok: false, error: "debug.attach vuole {command}" };
  const root = workspaceRoot(opts.root);
  const timeout = opts.timeoutMs ?? timeoutMs();
  let child: ChildProcess;
  try {
    child = spawn(opts.command, opts.args ?? [], { cwd: root });
  } catch (e) {
    return { ok: false, error: `adapter non avviabile: ${String(e).slice(0, 160)}` };
  }
  const id = `dbg-${++counter}`;
  const s: Session = { id, child, seq: 0, pending: new Map(), buf: Buffer.alloc(0), timeout };
  sessions.set(id, s);
  child.stdout?.on("data", (d: Buffer) => onData(s, d));
  const fail = (e: unknown) => {
    kill(s);
    sessions.delete(id);
    return { ok: false as const, error: String(e).slice(0, 200) };
  };
  // Morte immediata (binary errato): fallisce in fretta via error/exit.
  const earlyDeath = new Promise<never>((_, rej) => {
    child.on("error", (e) => rej(e));
    child.on("exit", (code) => rej(new Error(`adapter uscito subito (exit ${code})`)));
  });
  try {
    await Promise.race([
      request(s, "initialize", { clientID: "omnicore", adapterID: "omnicore", pathFormat: "path", linesStartAt1: true, columnsStartAt1: true }),
      earlyDeath,
    ]);
    return { ok: true, session: id };
  } catch (e) {
    return fail(e instanceof Error ? e.message : e);
  }
}

function get(id: string): Session | null {
  const s = sessions.get(id) ?? null;
  return s;
}

/** Ritorna sessione o errore onesto. */
function need(id: string): { s?: Session; error?: string } {
  const s = get(id);
  return s ? { s } : { error: `sessione debug non trovata: ${id} (debug.attach prima)` };
}

function absPath(root: string, file: string): string {
  return file.startsWith("/") ? file : join(root, file);
}

/** Breakpoint su file:riga. Mai throw. */
export async function dapBreak(session: string, file: string, line: number): Promise<{ ok: boolean; breakpoints?: unknown; error?: string }> {
  const n = need(session);
  if (!n.s) return { ok: false, error: n.error };
  try {
    const root = workspaceRoot();
    const r = await request(n.s, "setBreakpoints", { source: { path: absPath(root, file) }, breakpoints: [{ line: Math.max(1, line) }] });
    return { ok: true, breakpoints: r?.breakpoints ?? [] };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

/** Esecuzione: continue | next | stepIn | stepOut. Mai throw. */
export async function dapGo(session: string, op = "continue", threadId = 1): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const n = need(session);
  if (!n.s) return { ok: false, error: n.error };
  const cmd = op === "next" ? "next" : op === "stepIn" ? "stepIn" : op === "stepOut" ? "stepOut" : "continue";
  try {
    const r = await request(n.s, cmd, { threadId });
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

/** Variabili di uno scope/frame (variablesReference). Mai throw. */
export async function dapVars(session: string, ref: number): Promise<{ ok: boolean; variables?: unknown; error?: string }> {
  const n = need(session);
  if (!n.s) return { ok: false, error: n.error };
  try {
    const r = await request(n.s, "variables", { variablesReference: ref });
    return { ok: true, variables: r?.variables ?? [] };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

/** Chiude la sessione (disconnect + kill). Sempre ok. */
export function dapDetach(session: string): { closed: boolean } {
  const s = sessions.get(session);
  if (s) {
    try {
      s.child.stdin?.write(encode({ seq: ++s.seq, type: "request", command: "disconnect", arguments: { terminateDebuggee: true } }));
    } catch { /* chiusura best-effort */ }
    kill(s);
    sessions.delete(session);
    return { closed: true };
  }
  return { closed: false };
}

export const dap = { attach: dapAttach, break: dapBreak, go: dapGo, vars: dapVars, detach: dapDetach };
