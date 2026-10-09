// Facoltà NATIVA — mani proprie di Omnicore: file + shell senza vendor.
//
// Root consentito: OMNICORE_WORKSPACE o cwd. Ogni path viene risolto e deve
// restare dentro il root (niente `..` escape). Comandi shell con timeout,
// output troncato e blocklist sui pattern distruttivi ovvi.
// Zero dipendenze: solo node:fs, node:path, node:child_process.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { resolve, sep, dirname, basename } from "node:path";
import { spawn } from "node:child_process";

export function workspaceRoot(): string {
  return resolve(process.env["OMNICORE_WORKSPACE"] ?? process.cwd());
}

/** Risolve un path utente dentro il root. Throw se esce (escape negato). */
export function resolveInRoot(userPath: string, root = workspaceRoot()): string {
  const abs = resolve(root, userPath);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`path fuori dal workspace (${root}): ${userPath}`);
  }
  return abs;
}

/** Lettura file sotto root. Ritorna {ok, via, output}. Mai throw. */
export function readFile(userPath: string, opts: { root?: string; maxChars?: number } = {}): { ok: boolean; via: string; output: string } {
  try {
    const abs = resolveInRoot(userPath, opts.root);
    const text = readFileSync(abs, "utf8");
    const max = opts.maxChars ?? 8000;
    return { ok: true, via: "code(native-read)", output: text.length > max ? text.slice(0, max) + "\n…(troncato)" : text };
  } catch (e) {
    return { ok: false, via: "code(native-read)", output: `lettura fallita: ${String(e).slice(0, 200)}` };
  }
}

/** Scrittura file sotto root (crea dir mancanti). Mai throw. */
export function writeFile(userPath: string, content: string, opts: { root?: string } = {}): { ok: boolean; via: string; output: string } {
  try {
    if (content.length > 200_000) return { ok: false, via: "code(native-write)", output: "contenuto troppo grande (max 200KB)" };
    const abs = resolveInRoot(userPath, opts.root);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    return { ok: true, via: "code(native-write)", output: `scritto ${abs} (${content.length} char)` };
  } catch (e) {
    return { ok: false, via: "code(native-write)", output: `scrittura fallita: ${String(e).slice(0, 200)}` };
  }
}

/** Elenco semplice di una dir sotto root. Mai throw. */
export function listDir(userPath = ".", opts: { root?: string } = {}): { ok: boolean; via: string; output: string } {
  try {
    const abs = resolveInRoot(userPath, opts.root);
    const st = statSync(abs);
    if (!st.isDirectory()) return { ok: false, via: "code(native-read)", output: `non è una directory: ${userPath}` };
    const names = readdirSync(abs).map((n) => (statSync(abs + sep + n).isDirectory() ? n + "/" : n));
    return { ok: true, via: "code(native-read)", output: names.join("\n") || "(vuota)" };
  } catch (e) {
    return { ok: false, via: "code(native-read)", output: `elenco fallito: ${String(e).slice(0, 200)}` };
  }
}

// Pattern distruttivi ovvi: negati prima di ogni spawn, con motivo.
const BLOCKED = [
  /\b(format|mkfs)\b/i,
  /\bdd\s+.*\bof=\/dev\//i,
  /\b(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b/i,
  /:\(\)\s*\{.*;\s*\}\s*;/, // fork bomb
  />\s*\/dev\/sd[a-z]/i,
];

/** Vero se il segmento esegue `rm` ricorsivo come comando (non come argomento). */
function isRecursiveRm(cmd: string): boolean {
  for (const seg of cmd.split(/;|\n|\|\||\||&&|&/)) {
    const m = seg.trim().match(/^(?:sudo\s+)?(?:\/[\w./-]*\/)?rm\s+(.*)$/i);
    if (m && /(^|\s)-[a-zA-Z]*[rR]|--recursive/i.test(` ${m[1]}`)) return true;
  }
  return false;
}

export function isBlocked(cmd: string): string | null {
  for (const re of BLOCKED) {
    if (re.test(cmd)) return `comando bloccato dalla safety: pattern ${re.source.slice(0, 40)}`;
  }
  if (isRecursiveRm(cmd)) return "comando bloccato dalla safety: rm ricorsivo";
  return null;
}

export interface ShellResult { ok: boolean; via: string; output: string; exitCode: number | null }

/** Shell controllata: sh -c, timeout con kill, stdout/stderr troncati. Mai throw. */
export function runShell(cmd: string, opts: { cwd?: string; timeoutMs?: number; maxChars?: number } = {}): Promise<ShellResult> {
  const via = "code(native-shell)";
  const blocked = isBlocked(cmd);
  if (blocked) return Promise.resolve({ ok: false, via, output: blocked, exitCode: null });
  const timeoutMs = opts.timeoutMs ?? Number(process.env["OMNICORE_SHELL_TIMEOUT_MS"] ?? "30000");
  const max = opts.maxChars ?? 4000;
  let cwd = workspaceRoot();
  if (opts.cwd) {
    try {
      cwd = resolveInRoot(opts.cwd);
    } catch (e) {
      return Promise.resolve({ ok: false, via, output: String(e).slice(0, 200), exitCode: null });
    }
  }
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", cmd], { cwd });
    let out = "";
    let err = "";
    const trim = (s: string) => (s.length > max ? s.slice(0, max) + "\n…(troncato)" : s);
    child.stdout.on("data", (d) => { out += String(d); });
    child.stderr.on("data", (d) => { err += String(d); });
    child.on("error", (e) => resolve({ ok: false, via, output: `spawn fallito: ${String(e).slice(0, 200)}`, exitCode: null }));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, via, output: `timeout dopo ${timeoutMs}ms, processo killato. Parziale:\n${trim(out)}`, exitCode: null });
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      const body = trim(out + (err ? `\n[stderr]\n${err}` : ""));
      resolve(code === 0
        ? { ok: true, via, output: body || "(nessun output)", exitCode: code }
        : { ok: false, via, output: `exit ${code}: ${body.slice(0, 500)}`, exitCode: code });
    });
  });
}

export const nativeFs = { workspaceRoot, resolveInRoot, readFile, writeFile, listDir, runShell, isBlocked };
export { basename };
