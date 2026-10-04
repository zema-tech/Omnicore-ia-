// Lexer OmniLang — mirror di omniling/py/omniling/lexer.py.
// Righe significative: {lineno, level, text}. Stesse regole, stessi errori.
export interface OmniLine {
  lineno: number;
  level: number;
  text: string;
}

function stripComment(raw: string): string {
  let inStr = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') inStr = !inStr;
    else if (ch === "#" && !inStr) return raw.slice(0, i);
  }
  return raw;
}

export function lex(src: string): OmniLine[] {
  const out: OmniLine[] = [];
  const rows = src.split("\n");
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]!;
    const code0 = raw.split("#")[0] ?? "";
    if (code0.includes("\t") && raw.trim() !== "") {
      throw new Error(`riga ${i + 1}: tab vietati, usa 2 spazi per livello`);
    }
    const code = stripComment(raw);
    if (code.trim() === "") continue;
    const indent = code.length - code.trimStart().length;
    if (indent % 2 !== 0) throw new Error(`riga ${i + 1}: indentazione non multipla di 2`);
    out.push({ lineno: i + 1, level: indent / 2, text: code.trim() });
  }
  return out;
}
