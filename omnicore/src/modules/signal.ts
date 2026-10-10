// Modulo SIGNAL — backend via signal-cli esterno (stesso pattern di Ollama e
// tsserver: binario dell'utente, niente dipendenze nel repo).
// Invio one-shot: signal-cli -u NUM send -m TEXT DEST.
// Lettura: signal-cli -u NUM receive --timeout N --json (righe JSON envelope).
// Senza binary/numero: errore onesto con istruzioni. Mai throw.
import { spawn } from "node:child_process";

export interface SignalInbound { from: string; text: string; ts: number }
export interface SignalResult<T> { ok: boolean; via: string; data?: T; error?: string }

const VIA = "signal(signal-cli)";
const INSTALL = "installa signal-cli (https://github.com/AsamK/signal-cli) e registra il numero: signal-cli -u +NUM link|register|verify";

function account(): string {
  return process.env["SIGNAL_NUMBER"] ?? "";
}

function bin(): { cmd: string; prefix: string[] } {
  let prefix: string[] = [];
  try {
    const j = JSON.parse(process.env["SIGNAL_CLI_PREFIX_JSON"] ?? "[]");
    if (Array.isArray(j)) prefix = j.map(String);
  } catch { /* default vuoto */ }
  return { cmd: process.env["SIGNAL_CLI_BIN"] ?? "signal-cli", prefix };
}

function needConf(): string | null {
  if (!account()) return "SIGNAL_NUMBER non impostato (il tuo numero con +, già registrato)";
  return null;
}

function run(args: string[], timeout: number): Promise<{ code: number; out: string; err: string }> {
  const { cmd, prefix } = bin();
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, [...prefix, ...args], { timeout });
    } catch (e) {
      resolve({ code: 127, out: "", err: String(e).slice(0, 160) });
      return;
    }
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.stderr?.on("data", (d) => (err += String(d)));
    child.on("error", (e) => resolve({ code: 127, out, err: `${err} ${String(e).slice(0, 160)}` }));
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch { /* già morto */ }
      resolve({ code: 124, out, err: `${err} timeout ${timeout}ms` });
    }, timeout + 2000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 0, out, err });
    });
  });
}

/** Invia un messaggio diretto. */
export async function signalSend(to: string, text: string): Promise<SignalResult<{ to: string }>> {
  const cfg = needConf();
  if (cfg) return { ok: false, via: VIA, error: cfg };
  const dest = String(to ?? "").replace(/[\s-]/g, "");
  if (!/^\+\d{6,15}$/.test(dest)) return { ok: false, via: VIA, error: `destinatario invalido (serve +): ${to}` };
  if (!String(text ?? "").trim()) return { ok: false, via: VIA, error: "testo vuoto" };
  const r = await run(["-u", account(), "send", "-m", text.slice(0, 2000), dest], 30000);
  if (r.code === 127) return { ok: false, via: VIA, error: `signal-cli non trovato. ${INSTALL}` };
  if (r.code !== 0) return { ok: false, via: VIA, error: `send fallito: ${(r.err || r.out).slice(0, 200)}` };
  return { ok: true, via: VIA, data: { to: dest } };
}

function parseEnvelope(input: unknown): SignalInbound | null {
  let j: any;
  if (typeof input === "string") {
    try {
      j = JSON.parse(input);
    } catch {
      return null;
    }
  } else if (input && typeof input === "object") {
    j = input;
  } else {
    return null;
  }
  const env = j?.envelope ?? j;
  const from = String(env?.source ?? env?.sourceNumber ?? "");
  const dm = env?.dataMessage ?? {};
  const text = String(dm?.message ?? dm?.body ?? env?.syncMessage?.sentMessage?.message ?? "");
  if (!from || !text) return null;
  return { from, text: text.slice(0, 2000), ts: Number(env?.timestamp ?? Date.now()) };
}

/** Legge messaggi in arrivo (bounded). Ritorna {inbound}. */
export async function signalPoll(opts: { timeoutSec?: number } = {}): Promise<SignalResult<{ inbound: SignalInbound[] }>> {
  const cfg = needConf();
  if (cfg) return { ok: false, via: VIA, error: cfg };
  const secs = Math.max(1, Math.min(opts.timeoutSec ?? 15, 120));
  const r = await run(["-u", account(), "receive", "--timeout", String(secs), "--json"], secs * 1000 + 5000);
  if (r.code === 127) return { ok: false, via: VIA, error: `signal-cli non trovato. ${INSTALL}` };
  if (r.code !== 0 && r.code !== 124) return { ok: false, via: VIA, error: `receive: ${(r.err || r.out).slice(0, 200)}` };
  const inbound: SignalInbound[] = [];
  for (const line of r.out.split("\n")) {
    if (inbound.length >= 50) break;
    const p = parseEnvelope(line.trim());
    if (p) inbound.push(p);
  }
  return { ok: true, via: VIA, data: { inbound } };
}

export const signal = { send: signalSend, poll: signalPoll, parse: parseEnvelope };
