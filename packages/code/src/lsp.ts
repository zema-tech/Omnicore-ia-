// Client LSP generico via stdio — parla con tsserver, pyright, rust-analyzer
// o qualsiasi language server installato (comando esterno, opzionale).
// Protocollo: header Content-Length + JSON-RPC (initialize → richiesta →
// shutdown/exit). One-shot per chiamata, timeout, kill garantita. Mai throw.
import { spawn } from "node:child_process";

export interface LspPosition { line: number; character: number }
export interface LspLocation { file: string; line: number; character: number }

function encode(msg: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8"), body]);
}

interface Pending { res: (v: any) => void; rej: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

function decodeLoop(onMsg: (m: any) => void): { push: (d: Buffer) => void } {
  let buf = Buffer.alloc(0);
  return {
    push(d: Buffer) {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        const h = buf.indexOf("\r\n\r\n");
        if (h < 0) return;
        const head = buf.slice(0, h).toString("utf8");
        const m = head.match(/Content-Length:\s*(\d+)/i);
        if (!m) {
          buf = buf.slice(h + 4);
          continue;
        }
        const len = Number(m[1]);
        if (buf.length < h + 4 + len) return;
        const body = buf.slice(h + 4, h + 4 + len).toString("utf8");
        buf = buf.slice(h + 4 + len);
        try {
          onMsg(JSON.parse(body));
        } catch { /* frame rotto: ignora */ }
      }
    },
  };
}

export interface LspOpts {
  command: string;
  args?: string[];
  root?: string;
  timeoutMs?: number;
}

async function lspSession(opts: LspOpts, method: string, params: unknown): Promise<any> {
  const timeout = opts.timeoutMs ?? Number(process.env["OMNICORE_LSP_TIMEOUT_MS"] ?? "15000");
  return new Promise((resolvePromise, rejectPromise) => {
    let done = false;
    const doneOk = (v: any) => {
      if (!done) {
        done = true;
        resolvePromise(v);
      }
    };
    const doneKo = (e: Error) => {
      if (!done) {
        done = true;
        rejectPromise(e);
      }
    };
    let child;
    try {
      child = spawn(opts.command, opts.args ?? [], { cwd: opts.root });
    } catch (e) {
      doneKo(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const pending = new Map<number, Pending>();
    let seq = 0;
    const kill = () => {
      try {
        child.kill("SIGKILL");
      } catch { /* già morto */ }
    };
    const timer = setTimeout(() => {
      kill();
      doneKo(new Error(`lsp timeout ${timeout}ms`));
    }, timeout + 5000);
    const send = (msg: unknown, wait: boolean): Promise<any> | null => {
      if (!child.stdin) return null;
      try {
        child.stdin.write(encode(msg));
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
      if (!wait) return null;
      return new Promise((res, rej) => {
        const id = (msg as any).id;
        const t = setTimeout(() => {
          pending.delete(id);
          rej(new Error(`lsp timeout su richiesta ${id}`));
        }, timeout);
        pending.set(id, { res, rej, timer: t });
      });
    };
    const reader = decodeLoop((m: any) => {
      if (m?.id === undefined) return;
      const p = pending.get(Number(m.id));
      if (!p) return;
      pending.delete(Number(m.id));
      clearTimeout(p.timer);
      if (m.error) p.rej(new Error(`lsp: ${String(m.error?.message ?? m.error).slice(0, 200)}`));
      else p.res(m.result);
    });
    child.stdout?.on("data", (d: Buffer) => reader.push(Buffer.from(d)));
    child.on("error", (e) => {
      clearTimeout(timer);
      doneKo(e);
    });
    child.on("exit", () => {
      clearTimeout(timer);
      doneKo(new Error("language server uscito prima della risposta"));
    });
    (async () => {
      try {
        const rootUri = `file://${opts.root ?? process.cwd()}`;
        seq++;
        await send({ jsonrpc: "2.0", id: seq, method: "initialize", params: { processId: null, rootUri, capabilities: {} } }, true);
        send({ jsonrpc: "2.0", method: "initialized", params: {} }, false);
        seq++;
        const result = await send({ jsonrpc: "2.0", id: seq, method, params }, true);
        seq++;
        send({ jsonrpc: "2.0", id: seq, method: "shutdown", params: null }, false);
        try {
          child.stdin?.write(encode({ jsonrpc: "2.0", method: "exit" }));
        } catch { /* chiusura best-effort */ }
        clearTimeout(timer);
        kill();
        doneOk(result);
      } catch (e) {
        clearTimeout(timer);
        kill();
        doneKo(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  });
}

function toLocations(res: any, root: string): LspLocation[] {
  const arr = res == null ? [] : Array.isArray(res) ? res : [res];
  const out: LspLocation[] = [];
  for (const l of arr) {
    const uri = String(l?.uri ?? l?.targetUri ?? "");
    const pos = l?.range?.start ?? l?.targetRange?.start ?? {};
    if (!uri.startsWith("file://")) continue;
    out.push({
      file: decodeURIComponent(uri.slice("file://".length).replace(root, "").replace(/^\//, "")) || uri,
      line: Number(pos.line ?? 0),
      character: Number(pos.character ?? 0),
    });
    if (out.length >= 10) break;
  }
  return out;
}

/** Definition via language server esterno. Mai throw. */
export async function lspDefinition(
  file: string,
  pos: LspPosition,
  opts: LspOpts,
): Promise<{ ok: boolean; locations: LspLocation[]; error?: string }> {
  const root = opts.root ?? process.cwd();
  const uri = file.startsWith("file://") ? file : `file://${root}/${file}`;
  try {
    const res = await lspSession({ ...opts, root }, "textDocument/definition", {
      textDocument: { uri },
      position: pos,
    });
    const locations = toLocations(res, root);
    if (!locations.length) return { ok: false, locations: [], error: "nessuna definizione dal server" };
    return { ok: true, locations };
  } catch (e) {
    return { ok: false, locations: [], error: String(e).slice(0, 200) };
  }
}

/** References via language server esterno. Mai throw. */
export async function lspReferences(
  file: string,
  pos: LspPosition,
  opts: LspOpts,
): Promise<{ ok: boolean; locations: LspLocation[]; error?: string }> {
  const root = opts.root ?? process.cwd();
  const uri = file.startsWith("file://") ? file : `file://${root}/${file}`;
  try {
    const res = await lspSession({ ...opts, root }, "textDocument/references", {
      textDocument: { uri },
      position: pos,
      context: { includeDeclaration: true },
    });
    return { ok: true, locations: toLocations(res, root) };
  } catch (e) {
    return { ok: false, locations: [], error: String(e).slice(0, 200) };
  }
}

export const lsp = { definition: lspDefinition, references: lspReferences };
