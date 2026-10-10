// Facoltà MEMORIA — la memoria fusa di Omnicore.
//
// Fonde tre fonti in UN solo risultato ordinato:
//   1. memoria nativa Omnicore (data/memory.json — fatti espliciti "ricordati che…")
//   2. Hermes (conversazioni/canali passati via bridge)
//   3. storico sessioni unificate (data/sessions.json)
//
// Chi chiama (pipeline, agent loop) usa solo search()/read()/remember().
// Se un domani Hermes viene sostituito, cambia solo questo file.
import { hermes } from "../adapters/hermes.ts";
import { loadConfig } from "../config.ts";
import { recallMem, remember as storeRemember, recentHistory } from "../mind/memory.ts";
import { memRecall } from "../modules/memories.ts";

export interface MemoryHit {
  source: "omnicore" | "hermes" | "session" | "store";
  text: string;
  ts?: number;
}

/** Ricerca fusa: memoria nativa + Hermes + sessioni. Mai throw, sempre lista. */
export async function search(query: string, limit = 5): Promise<{ hits: MemoryHit[]; via: string }> {
  const hits: MemoryHit[] = [];
  const vias: string[] = [];

  // 1) nativa (sempre disponibile, anche offline)
  try {
    for (const f of recallMem(query, limit)) {
      hits.push({ source: "omnicore", text: String((f as any).text ?? ""), ts: (f as any).ts });
    }
    vias.push("omnicore");
  } catch { /* best-effort */ }

  // 2) Hermes (passato lungo)
  try {
    const cfg = loadConfig();
    const res: any = await hermes.recall(query, limit, { python: cfg.hermesPython, hermesDir: cfg.hermesDir });
    const convs = res?.conversations ?? res?.items ?? [];
    for (const c of (Array.isArray(convs) ? convs : []).slice(0, limit)) {
      const text = typeof c === "string" ? c : JSON.stringify(c).slice(0, 280);
      if (text) hits.push({ source: "hermes", text });
    }
    vias.push("hermes");
  } catch { /* offline: la nativa basta */ }

  // 3) sessioni recenti (contesto breve)
  try {
    for (const m of recentHistory(4)) {
      const text = String(m.text ?? "");
      if (text && /ricord|chiamo|prefer|nome/i.test(query) && text.length > 2) {
        hits.push({ source: "session", text: text.slice(0, 200), ts: m.ts });
      }
    }
    vias.push("sessions");
  } catch { /* best-effort */ }

  // 4) memoria strutturata SQLite (BM25, sempre disponibile come la nativa)
  try {
    for (const h of await memRecall(query, { limit })) {
      if (h.content) hits.push({ source: "store", text: h.content.slice(0, 280), ts: h.updated });
    }
    vias.push("store");
  } catch { /* best-effort */ }

  return { hits: hits.slice(0, limit * 2), via: `memory(${vias.join("+") || "empty"})` };
}

/** Lettura profonda di una conversazione/sessione per chiave (Hermes). */
export async function read(key: string, limit = 50): Promise<unknown> {
  const cfg = loadConfig();
  return hermes.read(key, limit, { python: cfg.hermesPython, hermesDir: cfg.hermesDir });
}

/** Memorizza fatti espliciti dal messaggio. Ritorna {saved, total}. Mai throw. */
export function remember(text: string, intent = "chat"): { saved: number; total: number } {
  try {
    return storeRemember(text, intent);
  } catch {
    return { saved: 0, total: 0 };
  }
}

export const memory = { search, read, remember };
