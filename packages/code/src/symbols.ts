// Indice simboli nativo — code intelligence senza tree-sitter/LSP obbligatori.
// Scansiona ts/js/tsx/jsx/py: funzioni, classi, interfacce, const top-level.
// Solo lettura, jail sul workspace, cap anti-esplosione. Mai throw.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { workspaceRoot } from "./workspace.ts";

export interface SymbolDef {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "method" | "variable";
  file: string;
  line: number;
  exported: boolean;
}

export interface SymbolRef {
  file: string;
  line: number;
  text: string;
}

const SKIP = new Set(["node_modules", ".git", "__pycache__", "dist", "target", ".venv", "vendor"]);
const MAX_FILES = 500;
const MAX_BYTES = 200_000;
const MAX_REFS = 50;
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);

function listFiles(root: string): string[] {
  const out: string[] = [];
  const queue = [root];
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
      else if ([...EXT].some((x) => full.endsWith(x)) && st.size <= MAX_BYTES) {
        out.push(full);
        if (out.length >= MAX_FILES) break;
      }
    }
  }
  return out;
}

function symbolsInFile(file: string, rel: string, isPy: boolean): SymbolDef[] {
  let body: string;
  try {
    body = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  if (body.includes("\0")) return [];
  const out: SymbolDef[] = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const line = i + 1;
    if (isPy) {
      let m = ln.match(/^\s*(async\s+def|def|class)\s+([A-Za-z_]\w*)/);
      if (m) {
        out.push({ name: m[2], kind: m[1].includes("class") ? "class" : "function", file: rel, line, exported: !/^\s/.test(ln) });
        continue;
      }
      m = ln.match(/^([A-Za-z_]\w*)\s*=(?!=)/);
      if (m) out.push({ name: m[1], kind: "variable", file: rel, line, exported: true });
      continue;
    }
    let m = ln.match(/^\s*(export\s+)?(async\s+)?(function|class)\s+([A-Za-z_]\w*)/);
    if (m) {
      out.push({ name: m[4], kind: m[3] === "class" ? "class" : "function", file: rel, line, exported: !!m[1] });
      continue;
    }
    m = ln.match(/^\s*export\s+(interface|type|enum)\s+([A-Za-z_]\w*)/);
    if (m) {
      out.push({ name: m[2], kind: m[1] === "interface" ? "interface" : "type", file: rel, line, exported: true });
      continue;
    }
    m = ln.match(/^\s*(export\s+)?(const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(async\s*)?(\([^)]*\)|[\w$]+\s*)=>/);
    if (m) {
      out.push({ name: m[3], kind: "function", file: rel, line, exported: !!m[1] });
      continue;
    }
    m = ln.match(/^\s*(export\s+)?(const)\s+([A-Za-z_]\w*)\s*=/);
    if (m) {
      out.push({ name: m[3], kind: "const", file: rel, line, exported: !!m[1] });
      continue;
    }
    m = ln.match(/^\s*(public|private|protected|static|async\s+|static\s+)*([A-Za-z_]\w*)\s*\([^)]*\)\s*[{:]/);
    if (m && !/^(if|for|while|switch|catch|function|return|import)\b/.test(m[2])) {
      out.push({ name: m[2], kind: "method", file: rel, line, exported: false });
    }
  }
  return out;
}

/** Indice simboli del workspace. Mai throw: errore in {ok:false}. */
export function indexSymbols(root?: string): { ok: boolean; symbols: SymbolDef[]; error?: string } {
  try {
    const base = workspaceRoot(root);
    const files = listFiles(base);
    const symbols: SymbolDef[] = [];
    for (const f of files) {
      const rel = f.slice(base.length + 1).split(sep).join("/");
      symbols.push(...symbolsInFile(f, rel, f.endsWith(".py")));
    }
    return { ok: true, symbols };
  } catch (e) {
    return { ok: false, symbols: [], error: String(e).slice(0, 200) };
  }
}

/** Definizioni di un simbolo (export e class/func prima). Mai throw. */
export function findDefinition(name: string, root?: string): { ok: boolean; defs: SymbolDef[]; error?: string } {
  const idx = indexSymbols(root);
  if (!idx.ok) return { ok: false, defs: [], error: idx.error };
  const rank = (s: SymbolDef) => (s.exported ? 0 : 1) + (s.kind === "class" || s.kind === "function" ? 0 : 2);
  const defs = idx.symbols.filter((s) => s.name === name).sort((a, b) => rank(a) - rank(b)).slice(0, 10);
  if (!defs.length) return { ok: false, defs: [], error: `simbolo non trovato: ${name}` };
  return { ok: true, defs };
}

/** Riferimenti (occorrenze word-boundary, definizioni escluse). Mai throw. */
export function findReferences(name: string, root?: string): { ok: boolean; refs: SymbolRef[]; error?: string } {
  try {
    const base = workspaceRoot(root);
    const files = listFiles(base);
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    const refs: SymbolRef[] = [];
    for (const f of files) {
      let body: string;
      try {
        body = readFileSync(f, "utf8");
      } catch {
        continue;
      }
      if (body.includes("\0")) continue;
      const rel = f.slice(base.length + 1).split(sep).join("/");
      const lines = body.split("\n");
      for (let i = 0; i < lines.length && refs.length < MAX_REFS; i++) {
        if (re.test(lines[i])) refs.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 160) });
      }
      if (refs.length >= MAX_REFS) break;
    }
    return { ok: true, refs };
  } catch (e) {
    return { ok: false, refs: [], error: String(e).slice(0, 200) };
  }
}
