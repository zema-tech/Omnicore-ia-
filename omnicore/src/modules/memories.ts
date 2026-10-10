// Modulo MEMORIES — memoria strutturata persistente (da studio OpenClaw
// Active Memory + Hermes snapshot: SQLite + FTS5 BM25, colonna embedding
// opzionale con rerank coseno quando fornito. Zero dipendenze (node:sqlite).
// API: memStore / memRecall / memForget. Throw solo su input invalido
// (il loop intercetta); memRecall non lancia mai.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, dirname as dname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dname(fileURLToPath(import.meta.url));

export interface MemoryRow { id: number; session: string; content: string; tags: string; created: number; updated: number }
export interface RecallHit extends MemoryRow { score: number }

export function memoriesFile(): string {
  return process.env["OMNICORE_MEMORIES_FILE"] ?? join(HERE, "..", "..", "data", "memories.sqlite");
}

let db: DatabaseSync | null = null;
let dbPath = "";

function open(): DatabaseSync {
  const p = memoriesFile();
  if (db && dbPath === p) return db;
  close();
  mkdirSync(dname(p), { recursive: true });  db = new DatabaseSync(p);
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories(
      id INTEGER PRIMARY KEY, session TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '',
      embedding TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);
  `);
  // FTS esterno (content=): il comando 'delete' funziona solo così.
  // Ricostruzione idempotente: guarisce anche db creati dallo schema vecchio.
  db.exec(`
    DROP TRIGGER IF EXISTS memories_ai;
    DROP TRIGGER IF EXISTS memories_ad;
    DROP TRIGGER IF EXISTS memories_au;
    DROP TABLE IF EXISTS memories_fts;
    CREATE VIRTUAL TABLE memories_fts USING fts5(content, tags, content='memories', content_rowid='id');
    INSERT INTO memories_fts(rowid, content, tags) SELECT id, content, tags FROM memories;
    CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, tags) VALUES (new.id, new.content, new.tags);
    END;
    CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES('delete', old.id, old.content, old.tags);
    END;
    CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES('delete', old.id, old.content, old.tags);
      INSERT INTO memories_fts(rowid, content, tags) VALUES (new.id, new.content, new.tags);
    END;
  `);
  dbPath = p;
  return db;
}

/** Chiude il db (test / shutdown). */
export function memClose(): void {
  close();
}

function close(): void {
  try {
    db?.close();
  } catch { /* già chiuso */ }
  db = null;
  dbPath = "";
}

/** Salva un ricordo. Auto-embedding se OMNICORE_EMBED_MODEL. Throw se vuoto. */
export async function memStore(content: string, opts: { session?: string; tags?: string[]; embedding?: number[] } = {}): Promise<{ id: number }> {
  const text = String(content ?? "").trim();
  if (!text) throw new Error("ricordo vuoto");
  if (text.length > 4000) throw new Error("ricordo troppo lungo (max 4000)");
  let emb = opts.embedding?.length ? opts.embedding.slice(0, 512) : undefined;
  if (!emb && embedModel()) {
    try {
      emb = (await memEmbed(text)) ?? undefined;
    } catch { /* vettore opzionale */ }
  }
  const d = open();
  const now = Date.now();
  const r = d.prepare("INSERT INTO memories(session, content, tags, embedding, created, updated) VALUES (?,?,?,?,?,?)")
    .run(opts.session ?? "", text, (opts.tags ?? []).map(String).join(" ").slice(0, 300), emb ? JSON.stringify(emb) : null, now, now);
  return { id: Number(r.lastInsertRowid) };
}

/** Dimentica per id. Ritorna true se esisteva. */
export function memForget(id: number): boolean {
  const d = open();
  const r = d.prepare("DELETE FROM memories WHERE id=?").run(Number(id));
  return r.changes > 0;
}

export function memCount(): number {
  try {
    return Number(open().prepare("SELECT COUNT(*) AS n FROM memories").get()?.n ?? 0);
  } catch {
    return 0;
  }
}

/** Similarità coseno tra vettori (rerank quando entrambi presenti). */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Tokenizza per FTS5: parole alfanumeriche, resto scartato (niente syntax error). */
function ftsQuery(q: string): string {
  const words = q.toLowerCase().split(/[^a-z0-9à-öø-ÿ]+/i).filter((w) => w.length > 1).slice(0, 10);
  if (!words.length) return "";
  return words.map((w) => `"${w.replace(/"/g, '""')}"`).join(" OR ");
}

/**
 * Ricerca: BM25 su FTS5 + rerank coseno (embedding passato o auto-generato
 * se OMNICORE_EMBED_MODEL). Fallback ai più recenti. Mai throw.
 */
export async function memRecall(query: string, opts: { limit?: number; session?: string; embedding?: number[] } = {}): Promise<RecallHit[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 20));
  let emb = opts.embedding?.length ? opts.embedding : undefined;
  if (!emb && embedModel()) {
    try {
      emb = (await memEmbed(String(query ?? ""))) ?? undefined;
    } catch { /* solo BM25 */ }
  }
  try {
    const d = open();
    const fq = ftsQuery(String(query ?? ""));
    let rows: any[] = [];
    if (fq) {
      try {
        rows = d.prepare(
          `SELECT m.id, m.session, m.content, m.tags, m.created, m.updated, m.embedding, bm25(memories_fts) AS rank
           FROM memories_fts f JOIN memories m ON m.id = f.rowid
           WHERE memories_fts MATCH ? ${opts.session ? "AND m.session = ?" : ""}
           ORDER BY rank LIMIT ?`,
        ).all(...(opts.session ? [fq, opts.session, limit * 3] : [fq, limit * 3])) as any[];
      } catch {
        rows = [];
      }
    }
    if (!rows.length) {
      rows = d.prepare(
        `SELECT id, session, content, tags, created, updated, embedding, 0 AS rank FROM memories
         ${opts.session ? "WHERE session = ?" : ""} ORDER BY updated DESC LIMIT ?`,
      ).all(...(opts.session ? [opts.session, limit] : [limit])) as any[];
    }
    const hits: RecallHit[] = rows.map((r) => ({
      id: r.id, session: r.session, content: r.content, tags: r.tags,
      created: r.created, updated: r.updated,
      score: typeof r.rank === "number" ? -r.rank : 0,
    }));
    if (emb?.length) {
      for (const h of hits) {
        try {
          const stored = JSON.parse((rows.find((r) => r.id === h.id)?.embedding ?? "null") as string);
          if (Array.isArray(stored)) h.score += cosine(emb, stored) * 10;
        } catch { /* senza embedding: solo BM25 */ }
      }
      hits.sort((a, b) => b.score - a.score);
    }
    return hits.slice(0, limit);
  } catch {
    return [];
  }
}

export const memories = { file: memoriesFile, store: memStore, recall: memRecall, forget: memForget, count: memCount, close: memClose, cosine, embed: memEmbed };

/** Modello embedding locale (Ollama). Vuoto = vettori disabilitati. */
export function embedModel(): string {
  return process.env["OMNICORE_EMBED_MODEL"] ?? "";
}

function ollamaHost(): string {
  return (process.env["OLLAMA_HOST"] ?? "http://127.0.0.1:11434").replace(/\/$/, "");
}

/**
 * Embedding via Ollama /api/embeddings (locale, gratis, no key).
 * Ritorna null se Ollama assente o modello mancante. Mai throw.
 */
export async function memEmbed(text: string, model?: string): Promise<number[] | null> {
  const m = model ?? embedModel();
  if (!m || !String(text ?? "").trim()) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), Number(process.env["OMNICORE_EMBED_TIMEOUT_MS"] ?? "30000"));
    try {
      const r = await fetch(`${ollamaHost()}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: m, prompt: String(text).slice(0, 2000) }),
        signal: ctl.signal,
      });
      if (!r.ok) return null;
      const j = (await r.json().catch(() => null)) as any;
      const v = j?.embedding;
      if (!Array.isArray(v) || !v.every((n) => typeof n === "number")) return null;
      return v.slice(0, 1024);
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}
