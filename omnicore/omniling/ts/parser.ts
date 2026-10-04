// Parser OmniLang v0.1 — mirror di omniling/py/omniling/parser.py.
// Stessa grammatica, stesso AST (stesso ordine chiavi per parità JSON).
import { lex, type OmniLine } from "./lexer.ts";

const NAME = "[A-Za-z_][A-Za-z0-9_]*";
const reSystem = new RegExp(`^system\\s+(${NAME})\\s*:\\s*(${NAME})\\s+via\\s+("(?:[^"\\\\]|\\\\.)*")$`);
const reTool = new RegExp(`^tool\\s+(${NAME})\\s+on\\s+(${NAME})\\s*:$`);
const reFlow = new RegExp(`^flow(?:\\s+("(?:[^"\\\\]|\\\\.)*"))?(?:\\s+when\\s+(.+))?\\s*:$`);
const reCall = /^call\s+("(?:[^"\\]|\\.)*")$/;
const reArgs = /^args\s+(.+)$/;
const reAssign = new RegExp(`^(${NAME})\\s*=\\s*(.+)$`);
const reIf = /^if\s+(.+)\s*:$/;
const reCallref = new RegExp(`^(${NAME})\\s*\\((.*)\\)$`);
const reNamed = new RegExp(`^\\s*(${NAME})\\s*[:=]\\s*(.+?)\\s*$`);

export type Value = { t: string; v: unknown };

class Parser {
  private pos = 0;
  private lines: OmniLine[];
  constructor(lines: OmniLine[]) {
    this.lines = lines;
  }

  private peek(): OmniLine | null {
    return this.pos < this.lines.length ? this.lines[this.pos]! : null;
  }
  private next(): OmniLine {
    const ln = this.peek();
    if (!ln) throw new Error("fine input inattesa");
    this.pos++;
    return ln;
  }

  program(): Record<string, unknown> {
    const systems: unknown[] = [];
    const tools: unknown[] = [];
    const flows: unknown[] = [];
    let l: OmniLine | null;
    while ((l = this.peek()) !== null) {
      const ln = this.next();
      if (ln.level !== 0) throw new Error(`riga ${ln.lineno}: statement top-level non a livello 0`);
      if (ln.text.startsWith("system")) systems.push(this.system(ln));
      else if (ln.text.startsWith("tool")) tools.push(this.tool(ln));
      else if (ln.text.startsWith("flow")) flows.push(this.flow(ln, flows.length));
      else throw new Error(`riga ${ln.lineno}: atteso system|tool|flow, trovato '${ln.text}'`);
    }
    return { systems, tools, flows };
  }

  private system(ln: OmniLine): Record<string, unknown> {
    const m = reSystem.exec(ln.text);
    if (!m) throw new Error(`riga ${ln.lineno}: sintassi system: system <nome>: <kind> via "..."`);
    return { name: m[1], kind: m[2], via: this.string(m[3]!, ln.lineno) };
  }

  private tool(ln: OmniLine): Record<string, unknown> {
    const m = reTool.exec(ln.text);
    if (!m) throw new Error(`riga ${ln.lineno}: sintassi tool: tool <nome> on <system>:`);
    let call: string | null = null;
    const args: Record<string, Value> = {};
    let nxt: OmniLine | null;
    while ((nxt = this.peek()) !== null && nxt.level === 1) {
      const cur = this.next();
      const mc = reCall.exec(cur.text);
      if (mc) {
        if (call !== null) throw new Error(`riga ${cur.lineno}: un solo call per tool`);
        call = this.string(mc[1]!, cur.lineno);
        continue;
      }
      const ma = reArgs.exec(cur.text);
      if (ma) {
        for (const [k, v] of this.namedList(ma[1]!, cur.lineno)) args[k] = v;
        continue;
      }
      throw new Error(`riga ${cur.lineno}: in tool solo call|args, trovato '${cur.text}'`);
    }
    if (call === null) throw new Error(`riga ${ln.lineno}: tool senza call`);
    return { name: m[1], system: m[2], call, args };
  }

  private flow(ln: OmniLine, idx: number): Record<string, unknown> {
    const m = reFlow.exec(ln.text);
    if (!m) throw new Error(`riga ${ln.lineno}: sintassi flow: flow ["nome"] [when expr]:`);
    const name = m[1] ? this.string(m[1], ln.lineno) : `flow_${idx}`;
    const when = m[2] ? this.expr(m[2], ln.lineno) : null;
    const steps = this.block(1);
    if (steps.length === 0) throw new Error(`riga ${ln.lineno}: flow vuoto`);
    return { name, when, steps };
  }

  private block(level: number): Record<string, unknown>[] {
    const steps: Record<string, unknown>[] = [];
    let nxt: OmniLine | null;
    while ((nxt = this.peek()) !== null && nxt.level >= level) {
      if (nxt.level > level) throw new Error(`riga ${nxt.lineno}: indentazione eccessiva`);
      const cur = this.next();
      const mi = reIf.exec(cur.text);
      if (mi) {
        steps.push({ if: this.expr(mi[1]!, cur.lineno), steps: this.block(level + 1) });
        continue;
      }
      const ma = reAssign.exec(cur.text);
      if (!ma) throw new Error(`riga ${cur.lineno}: step non valido: '${cur.text}'`);
      const rhs = ma[2]!.trim();
      const mc = reCallref.exec(rhs);
      if (mc) {
        const inner = mc[2]!.trim();
        const args: Record<string, Value> = {};
        if (inner !== "") for (const [k, v] of this.namedList(inner, cur.lineno)) args[k] = v;
        steps.push({ assign: ma[1], call: mc[1], args });
      } else {
        steps.push({ assign: ma[1], value: this.value(rhs, cur.lineno) });
      }
    }
    return steps;
  }

  private string(tok: string, lineno: number): string {
    try {
      return JSON.parse(tok) as string;
    } catch {
      throw new Error(`riga ${lineno}: stringa non valida: '${tok}'`);
    }
  }

  private value(tok: string, lineno: number): Value {
    tok = tok.trim();
    if (tok.startsWith("$")) {
      this.checkName(tok.slice(1), lineno);
      return { t: "var", v: tok.slice(1) };
    }
    if (tok.startsWith('"')) return { t: "str", v: this.string(tok, lineno) };
    if (tok === "true" || tok === "false") return { t: "bool", v: tok === "true" };
    if (/^-?\d+(\.\d+)?$/.test(tok)) {
      // parità con Python: int se senza punto
      return tok.includes(".") ? { t: "num", v: parseFloat(tok) } : { t: "num", v: parseInt(tok, 10) };
    }
    this.checkName(tok, lineno);
    return { t: "var", v: tok };
  }

  private expr(src: string, lineno: number): Record<string, unknown> {
    for (const op of ["==", "!="]) {
      const i = src.indexOf(op);
      if (i >= 0) {
        return {
          l: this.value(src.slice(0, i).trim(), lineno),
          op,
          r: this.value(src.slice(i + 2).trim(), lineno),
        };
      }
    }
    return { l: this.value(src.trim(), lineno), op: null, r: null };
  }

  private namedList(src: string, lineno: number): [string, Value][] {
    const out: [string, Value][] = [];
    for (const part of splitTop(src, ",")) {
      const m = reNamed.exec(part);
      if (!m) throw new Error(`riga ${lineno}: argomento non valido: '${part}' (forma nome: valore)`);
      out.push([m[1]!, this.value(m[2]!, lineno)]);
    }
    return out;
  }

  private checkName(tok: string, lineno: number): void {
    if (!new RegExp(`^${NAME}$`).test(tok)) throw new Error(`riga ${lineno}: nome non valido: '${tok}'`);
  }
}

function splitTop(src: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let inStr = false;
  for (const ch of src) {
    if (ch === '"') inStr = !inStr;
    if (!inStr) {
      if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth--;
    }
    if (ch === sep && !inStr && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== "") parts.push(cur);
  return parts.map((x) => x.trim()).filter((x) => x !== "");
}

export function parse(src: string): Record<string, unknown> {
  return new Parser(lex(src)).program();
}
