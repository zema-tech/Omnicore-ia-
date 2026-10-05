// Memoria unificata Omnicore (zero dipendenze, file JSON).
// Mirror di omnicore_py/mind/memory.py.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // src/mind
const DATA = join(HERE, "..", "..", "data");
const MEM_FILE = join(DATA, "memory.json");
const SESS_FILE = join(DATA, "sessions.json");
const MAX_FACTS = 300;

const FACT_RE = /(ricordati che|ricorda che|ricorda:|mi chiamo|il mio nome e|preferisco|lavoro con|uso spesso|sono un|sono una|abito a|vivo a)/i;

function load(): any[] {
  try {
    const d = JSON.parse(readFileSync(MEM_FILE, "utf8"));
    return Array.isArray(d?.facts) ? d.facts : [];
  } catch { return []; }
}
function save(facts: any[]) {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(MEM_FILE, JSON.stringify({ facts: facts.slice(-MAX_FACTS) }, null, 2));
}
const toks = (s: string) => new Set((s.toLowerCase().match(/[a-zà-ÿ0-9]{3,}/g) ?? []));

export function remember(text: string, intent = "chat") {
  const facts = load();
  const sents = text.split(/[.\n!?]+/).map((s) => s.trim()).filter(Boolean);
  const isQ = text.trim().endsWith("?");
  const cands = isQ ? [] : sents.filter((s) => FACT_RE.test(s) && s.length > 12).slice(0, 2);
  let saved = 0;
  for (const s of cands) {
    if (s.length < 4 || facts.some((f) => f.text?.toLowerCase() === s.toLowerCase())) continue;
    facts.push({ text: s.slice(0, 280), intent, ts: Date.now() / 1000 });
    saved++;
  }
  if (saved) save(facts);
  return { saved, total: facts.length };
}

export function recallMem(query: string, limit = 5) {
  const facts = load();
  if (!facts.length || !query.trim()) return [];
  const q = toks(query);
  return facts
    .map((f) => {
      const t = toks(String(f.text ?? ""));
      let overlap = 0;
      for (const w of q) if (t.has(w)) overlap++;
      return { overlap, f };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || (b.f.ts - a.f.ts))
    .slice(0, limit)
    .map((x) => x.f);
}

export function recentHistory(limit = 8): any[] {
  try {
    if (!existsSync(SESS_FILE)) return [];
    const db = JSON.parse(readFileSync(SESS_FILE, "utf8"));
    const msgs: any[] = [];
    for (const s of Object.values<any>(db.sessions ?? {})) msgs.push(...(s.messages ?? []).slice(-3));
    return msgs.slice(-limit);
  } catch { return []; }
}
