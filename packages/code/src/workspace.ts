// Workspace jail — mani locali di @omnicore/code (zero dipendenze).
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { resolve, sep, dirname } from "node:path";
import { spawn } from "node:child_process";

export function workspaceRoot(explicit?: string): string {
  return resolve(explicit ?? process.env["OMNICORE_WORKSPACE"] ?? process.cwd());
}

export function resolveInRoot(userPath: string, root?: string): string {
  const base = workspaceRoot(root);
  const abs = resolve(base, userPath);
  if (abs !== base && !abs.startsWith(base + sep)) {
    throw new Error(`path fuori dal workspace (${base}): ${userPath}`);
  }
  return abs;
}

export type FsResult = { ok: boolean; via: string; output: string };

export function readFile(userPath: string, root?: string, maxChars = 8000): FsResult {
  try {
    const abs = resolveInRoot(userPath, root);
    const text = readFileSync(abs, "utf8");
    return {
      ok: true,
      via: "code(native-read)",
      output: text.length > maxChars ? text.slice(0, maxChars) + "\n…(troncato)" : text,
    };
  } catch (e) {
    return { ok: false, via: "code(native-read)", output: String(e).slice(0, 200) };
  }
}

export function writeFile(userPath: string, content: string, root?: string): FsResult {
  try {
    if (content.length > 200_000) {
      return { ok: false, via: "code(native-write)", output: "contenuto troppo grande (max 200KB)" };
    }
    const abs = resolveInRoot(userPath, root);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    return { ok: true, via: "code(native-write)", output: `scritto ${abs} (${content.length} char)` };
  } catch (e) {
    return { ok: false, via: "code(native-write)", output: String(e).slice(0, 200) };
  }
}

export function listDir(userPath = ".", root?: string): FsResult {
  try {
    const abs = resolveInRoot(userPath, root);
    if (!statSync(abs).isDirectory()) {
      return { ok: false, via: "code(native-list)", output: `non è una directory: ${userPath}` };
    }
    const names = readdirSync(abs).map((n) => {
      try {
        return statSync(abs + sep + n).isDirectory() ? n + "/" : n;
      } catch {
        return n;
      }
    });
    return { ok: true, via: "code(native-list)", output: names.join("\n") || "(vuota)" };
  } catch (e) {
    return { ok: false, via: "code(native-list)", output: String(e).slice(0, 200) };
  }
}

const BLOCKED = [
  /\brm\s+(-[a-z]*r[a-z]*\s+)*\/?(\s|$)/i,
  /\b(format|mkfs)\b/i,
  /\bdd\s+.*\bof=\/dev\//i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /:\(\)\s*\{.*;\s*\}\s*;/,
];

export function isBlocked(cmd: string): string | null {
  for (const re of BLOCKED) {
    if (re.test(cmd)) return `comando bloccato: ${re.source.slice(0, 40)}`;
  }
  return null;
}

export function runShell(
  cmd: string,
  opts: { root?: string; cwd?: string; timeoutMs?: number } = {},
): Promise<FsResult & { exitCode: number | null }> {
  const via = "code(native-shell)";
  const blocked = isBlocked(cmd);
  if (blocked) return Promise.resolve({ ok: false, via, output: blocked, exitCode: null });

  const base = workspaceRoot(opts.root);
  let cwd = base;
  if (opts.cwd) {
    try {
      cwd = resolveInRoot(opts.cwd, opts.root);
    } catch (e) {
      return Promise.resolve({ ok: false, via, output: String(e).slice(0, 200), exitCode: null });
    }
  }

  const timeoutMs = opts.timeoutMs ?? 30_000;
  return new Promise((resolvePromise) => {
    const child = spawn("sh", ["-c", cmd], { cwd });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", (e) =>
      resolvePromise({ ok: false, via, output: String(e).slice(0, 200), exitCode: null }),
    );
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolvePromise({
        ok: false,
        via,
        output: `timeout ${timeoutMs}ms\n${out.slice(0, 2000)}`,
        exitCode: null,
      });
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      const body = (out + (err ? `\n[stderr]\n${err}` : "")).slice(0, 4000);
      resolvePromise({
        ok: code === 0,
        via,
        output: body || "(nessun output)",
        exitCode: code,
      });
    });
  });
}
