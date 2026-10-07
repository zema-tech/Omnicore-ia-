// Modulo SEARCH — glob + grep nativi (modellato su OpenCode glob.ts/grep.ts).
// Solo lettura, jail sul workspace, skip di node_modules/.git, limiti anti-esplosione.
// Zero dipendenze.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { resolveInRoot } from "../faculties/native_fs.ts";

const SKIP = new Set(["node_modules", ".git", "__pycache__", "dist", "target", ".venv"]);
const MAX_FILES = 100;
const MAX_MATCHES = 50;

function globToRegExp(pattern: string): RegExp {
  // *, **, ?  — il resto letterale
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      re += ".*";
      i++;
      if (pattern[i + 1] === "/") i++;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

function walk(root: string, out: string[], budget: { n: number }): void {
  if (budget.n <= 0) return;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const e of entries) {
    if (budget.n <= 0) return;
    if (SKIP.has(e)) continue;
    const full = join(root, e);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out, budget);
    else {
      out.push(full);
      budget.n--;
    }
  }
}

function allFiles(rootDir: string): string[] {
  const abs = resolveInRoot(rootDir);
  const out: string[] = [];
  walk(abs, out, { n: 5000 });
  return out;
}

/** File che matchano il pattern (relativi al workspace). */
export function globFiles(pattern: string, rootDir = "."): { ok: boolean; via: string; output: string[]; error?: string } {
  const via = "code(native-glob)";
  try {
    const abs = resolveInRoot(rootDir);
    const rel = (f: string) => f.slice(abs.length + 1).split(sep).join("/");
    const out: string[] = [];
    const queue = [abs];
    const re = globToRegExp(pattern.replace(/^\.\//, ""));
    while (queue.length && out.length < MAX_FILES) {
      const cur = queue.pop()!;
      let entries: string[];
      try {
        entries = readdirSync(cur);
      } catch {
        continue;
      }
      for (const e of entries) {
        if (SKIP.has(e)) continue;
        const full = join(cur, e);
        let st;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) queue.push(full);
        else if (re.test(rel(full)) || re.test(e)) {
          out.push(rel(full));
          if (out.length >= MAX_FILES) break;
        }
      }
    }
    return { ok: true, via, output: out.sort() };
  } catch (e) {
    return { ok: false, via, output: [], error: String(e).slice(0, 200) };
  }
}

export interface GrepHit {
  file: string;
  line: number;
  text: string;
}

/** Cerca regex nei file (solo testo, max 200KB/file). */
export function grepFiles(regex: string, rootDir = ".", opts: { files?: string } = {}): { ok: boolean; via: string; hits: GrepHit[]; error?: string } {
  const via = "code(native-grep)";
  let re: RegExp;
  try {
    re = new RegExp(regex);
  } catch {
    return { ok: false, via, hits: [], error: `regex invalida: ${regex}` };
  }
  try {
    const abs = resolveInRoot(rootDir);
    const files = allFiles(rootDir).filter((f) => {
      if (!opts.files) return true;
      try {
        return globToRegExp(opts.files).test(f.slice(abs.length + 1).split(sep).join("/"));
      } catch {
        return true;
      }
    });
    const hits: GrepHit[] = [];
    for (const f of files) {
      if (hits.length >= MAX_MATCHES) break;
      let body: string;
      try {
        const st = statSync(f);
        if (st.size > 200_000) continue;
        body = readFileSync(f, "utf8");
      } catch {
        continue;
      }
      if (body.includes("\0")) continue; // binario
      const lines = body.split("\n");
      for (let i = 0; i < lines.length && hits.length < MAX_MATCHES; i++) {
        let m: boolean;
        try {
          m = re.test(lines[i]);
        } catch {
          continue;
        }
        if (m) {
          hits.push({ file: f.slice(abs.length + 1).split(sep).join("/"), line: i + 1, text: lines[i].slice(0, 200) });
        }
      }
    }
    return { ok: true, via, hits };
  } catch (e) {
    return { ok: false, via, hits: [], error: String(e).slice(0, 200) };
  }
}

export const search = { glob: globFiles, grep: grepFiles };
