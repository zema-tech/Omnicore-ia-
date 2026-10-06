// Vault "cervello" — note Markdown con link [[nota]], versionate con git.
// Dir: OMNICORE_VAULT_DIR o <omnicore>/data/vault (tracciata: vedi .gitignore).
// Funzioni: saveNote / searchNotes / linkNotes / recallFor (ricerca + 1 hop di link).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

export function vaultDir(): string {
  if (process.env["OMNICORE_VAULT_DIR"]) return process.env["OMNICORE_VAULT_DIR"];
  return new URL("../../data/vault", import.meta.url).pathname;
}

export interface VaultHit {
  file: string;
  title: string;
  snippet: string;
  links: string[];
  score: number;
}

function slug(s: string): string {
  const clean = s.toLowerCase().replace(/[^a-z0-9à-ÿ\-_ ]/gi, "").trim().replace(/\s+/g, "-").slice(0, 60);
  return clean || "nota";
}

function linksOf(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const name = m[1].trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

function titleOf(body: string, fallback: string): string {
  const m = body.match(/^#\s+(.+)$/m);
  return (m?.[1] ?? fallback).trim().slice(0, 120);
}

function listNotes(): { file: string; body: string }[] {
  const dir = vaultDir();
  try {
    mkdirSync(dir, { recursive: true });
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const file = join(dir, basename(f));
        try {
          return { file, body: readFileSync(file, "utf8") };
        } catch {
          return null;
        }
      })
      .filter((x): x is { file: string; body: string } => x !== null);
  } catch {
    return [];
  }
}

const toks = (s: string) => new Set((s.toLowerCase().match(/[a-zà-ÿ0-9]{3,}/g) ?? []));

/** Salva una nota. Ritorna il path. Mai throw oltre Error di validazione. */
export function saveNote(title: string, body: string): string {
  if (!title.trim() && !body.trim()) throw new Error("nota vuota");
  const dir = vaultDir();
  mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const file = join(dir, basename(`${date}-${slug(title)}.md`));
  const content = `# ${title.trim() || "Nota"}\n\n${body.trim()}\n`;
  writeFileSync(file, content);
  return file;
}

/** Cerca note per overlap lessicale su titolo+contenuto. Sempre lista. */
export function searchNotes(query: string, limit = 5): VaultHit[] {
  const q = toks(query);
  if (!q.size) return [];
  const hits: VaultHit[] = [];
  for (const { file, body } of listNotes()) {
    const t = toks(titleOf(body, file) + " " + body);
    let overlap = 0;
    for (const w of q) if (t.has(w)) overlap++;
    if (!overlap) continue;
    const idx = body.toLowerCase().indexOf([...q][0]);
    hits.push({
      file,
      title: titleOf(body, file),
      snippet: idx >= 0 ? body.slice(Math.max(0, idx - 60), idx + 140).replace(/\s+/g, " ").trim() : body.slice(0, 200),
      links: linksOf(body),
      score: overlap,
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Collega source -> [[target]] (append se manca). Ritorna true se ha scritto. */
export function linkNotes(sourceFile: string, targetTitle: string): boolean {
  const dir = vaultDir();
  const file = join(dir, basename(sourceFile));
  if (!existsSync(file)) throw new Error(`nota non trovata: ${basename(sourceFile)}`);
  const body = readFileSync(file, "utf8");
  const tag = `[[${targetTitle.trim()}]]`;
  if (!targetTitle.trim() || body.includes(tag)) return false;
  writeFileSync(file, body.replace(/\s+$/, "") + `\n\n${tag}\n`);
  return true;
}

/** Contesto per la risposta: note rilevanti + 1 hop sui loro [[link]]. */
export function recallFor(text: string, limit = 3): string {
  const hits = searchNotes(text, limit);
  if (!hits.length) return "";
  const byTitle = new Map<string, string>();
  for (const { body } of listNotes()) byTitle.set(titleOf(body, "").toLowerCase(), body);
  const parts = hits.map((h) => `- ${h.title}: ${h.snippet}`);
  for (const h of hits) {
    for (const link of h.links.slice(0, 2)) {
      const body = byTitle.get(link.toLowerCase());
      if (body) parts.push(`- (via [[${link}]]) ${titleOf(body, link)}: ${body.slice(0, 160).replace(/\s+/g, " ")}`);
    }
  }
  return parts.join("\n");
}
