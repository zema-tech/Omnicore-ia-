// Modulo EDIT — modifiche chirurgiche con diff preview (stile Claude Code:
// prima vedi il diff, poi applichi). Jail sul workspace come native_fs.
// Zero dipendenze.
import { readFileSync } from "node:fs";
import { resolveInRoot, writeFile } from "../faculties/native_fs.ts";

export interface EditPreview {
  ok: boolean;
  via: string;
  diff: string;
  occurrences: number;
}

/** Anteprima diff senza scrivere. unified semplice con 2 righe di contesto. */
export function editPreview(userPath: string, oldText: string, newText: string): EditPreview {
  const via = "code(native-edit)";
  if (!oldText) return { ok: false, via, diff: "oldText vuoto: niente da sostituire", occurrences: 0 };
  let abs: string;
  try {
    abs = resolveInRoot(userPath);
  } catch (e) {
    return { ok: false, via, diff: String(e).slice(0, 200), occurrences: 0 };
  }
  let body: string;
  try {
    body = readFileSync(abs, "utf8");
  } catch {
    return { ok: false, via, diff: `file non leggibile: ${userPath}`, occurrences: 0 };
  }
  const occurrences = body.split(oldText).length - 1;
  if (!occurrences) return { ok: false, via, diff: "testo non trovato nel file: niente da cambiare", occurrences: 0 };
  const lines = body.split("\n");
  const idx = lines.findIndex((l) => l.includes(oldText.split("\n")[0]));
  const ctx = 2;
  const from = lines.slice(Math.max(0, idx - ctx), idx).map((l) => `  ${l}`);
  const to = lines.slice(idx + 1, idx + 1 + ctx).map((l) => `  ${l}`);
  const diff = [
    `--- ${userPath} (${occurrences} occorrenza/e, anteprima sulla prima)`,
    ...from,
    ...oldText.split("\n").map((l) => `- ${l}`),
    ...newText.split("\n").map((l) => `+ ${l}`),
    ...to,
  ].join("\n");
  return { ok: true, via, diff, occurrences };
}

/** Applica la sostituzione (prima occorrenza, o tutte con all:true). Scrive davvero. */
export function editApply(
  userPath: string,
  oldText: string,
  newText: string,
  opts: { all?: boolean } = {},
): { ok: boolean; via: string; output: string } {
  const via = "code(native-edit)";
  if (!oldText) return { ok: false, via, output: "oldText vuoto" };
  let abs: string;
  try {
    abs = resolveInRoot(userPath);
  } catch (e) {
    return { ok: false, via, output: String(e).slice(0, 200) };
  }
  let body: string;
  try {
    body = readFileSync(abs, "utf8");
  } catch {
    return { ok: false, via, output: `file non leggibile: ${userPath}` };
  }
  const occurrences = body.split(oldText).length - 1;
  if (!occurrences) return { ok: false, via, output: "testo non trovato: nessuna modifica" };
  const next = opts.all ? body.split(oldText).join(newText) : body.replace(oldText, newText);
  const w = writeFile(userPath, next);
  if (!w.ok) return w;
  return { ok: true, via, output: `applicate ${opts.all ? occurrences : 1}/${occurrences} sostituzioni in ${abs}` };
}

export const edit = { preview: editPreview, apply: editApply };
