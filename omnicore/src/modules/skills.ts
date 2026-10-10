// Modulo SKILL — catalogo nativo di capacità caricabili
// (modellato su Hermes skills/ [SKILL.md + frontmatter] e OpenCode skill.ts).
//
// Dir: OMNICORE_SKILLS_DIR o <omnicore>/skills (tracciata con git).
// Ogni skill = cartella con SKILL.md che inizia con:
//   ---
//   name: mia-skill
//   description: cosa fa
//   ---
// Zero dipendenze.
import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

export interface Skill {
  name: string;
  description: string;
  path: string;
  instructions: string;
}

export function skillsDir(): string {
  if (process.env["OMNICORE_SKILLS_DIR"]) return process.env["OMNICORE_SKILLS_DIR"];
  return new URL("../../skills", import.meta.url).pathname;
}

function parseSkillFile(file: string): Skill | null {
  let body: string;
  try {
    body = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const m = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  const head = m?.[1] ?? "";
  const instructions = (m?.[2] ?? body).trim();
  const name = head.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? basename(file);
  const description = head.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
  if (!name) return null;
  return { name, description, path: file, instructions: instructions.slice(0, 4000) };
}

/** Tutte le skill dalla dir (SKILL.md per cartella o file singoli). */
export function listSkills(): Skill[] {
  const dir = skillsDir();
  const out: Skill[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) {
          const f = join(full, "SKILL.md");
          if (existsSync(f)) {
            const s = parseSkillFile(f);
            if (s) out.push(s);
          }
        } else if (/\.md$/i.test(entry)) {
          const s = parseSkillFile(full);
          if (s) out.push(s);
        }
      } catch {
        /* singola skill rotta: le altre restano */
      }
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Una skill per nome (o null). */
export function getSkill(name: string): Skill | null {
  return listSkills().find((s) => s.name === name) ?? null;
}

/** Ricerca per parole in nome+descrizione. */
export function searchSkills(query: string, limit = 5): Skill[] {

  const q = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!q.length) return [];
  return listSkills()
    .map((s) => {
      const hay = `${s.name} ${s.description}`.toLowerCase();
      let score = 0;
      for (const w of q) if (hay.includes(w)) score++;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

export const skills = { dir: skillsDir, list: listSkills, get: getSkill, search: searchSkills, create: createSkill, audit: auditSkills, prune: pruneSkill, compose: composeSkill };

/** Crea una skill da riuso: cartella <name>/SKILL.md con frontmatter. Throw se invalida. */
export function createSkill(name: string, description: string, instructions: string): { name: string; path: string } {
  const clean = String(name ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9\-_]{0,40}$/.test(clean)) {
    throw new Error(`nome skill invalido (a-z, 0-9, -, _): ${String(name).slice(0, 60)}`);
  }
  const desc = String(description ?? "").trim();
  if (!desc) throw new Error("la skill vuole una description di una riga");
  const body = String(instructions ?? "").trim();
  if (body.length < 20) throw new Error("istruzioni troppo corte (min 20 caratteri): descrivi quando e come usare la skill");
  if (body.length > 4000) throw new Error("istruzioni troppo lunghe (max 4000 caratteri)");
  const dir = join(skillsDir(), clean);
  const file = join(dir, "SKILL.md");
  if (existsSync(file)) throw new Error(`skill già esistente: ${clean}`);
  mkdirSync(dir, { recursive: true });
  const safe = (s: string) => s.replace(/\n/g, " ").slice(0, 200);
  writeFileSync(file, `---\nname: ${clean}\ndescription: ${safe(desc)}\n---\n${body}\n`);
  return { name: clean, path: file };
}

export interface AuditIssue { kind: "empty-desc" | "thin" | "overlap" | "stale"; skill: string; detail: string }
export interface AuditReport { total: number; issues: AuditIssue[] }

function keywords(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9à-öø-ÿ]+/i).filter((w) => w.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Curator: valuta il catalogo — description vuote, istruzioni esili,
 * sovrapposizioni funzionali (Jaccard su nome+descrizione ≥ 0.5),
 * file non toccati da 180 giorni. Mai throw.
 */
export function auditSkills(): AuditReport {
  try {
    const all = listSkills();
    const issues: AuditIssue[] = [];
    for (const s of all) {
      if (!s.description) issues.push({ kind: "empty-desc", skill: s.name, detail: "manca description: non indicizzabile" });
      if (s.instructions.length < 100) issues.push({ kind: "thin", skill: s.name, detail: `istruzioni esili (${s.instructions.length} char)` });
      try {
        const age = Date.now() - statSync(s.path).mtimeMs;
        if (age > 180 * 86400_000) issues.push({ kind: "stale", skill: s.name, detail: `non toccata da ${Math.round(age / 86400_000)} giorni` });
      } catch { /* mtime illeggibile: ignora */ }
    }
    const keys = all.map((s) => ({ name: s.name, k: keywords(`${s.name} ${s.description}`) }));
    for (let i = 0; i < keys.length && issues.length < 40; i++) {
      for (let j = i + 1; j < keys.length && issues.length < 40; j++) {
        const sim = jaccard(keys[i].k, keys[j].k);
        if (sim >= 0.5) {
          issues.push({ kind: "overlap", skill: `${keys[i].name} ↔ ${keys[j].name}`, detail: `sovrapposizione funzionale (sim ${sim.toFixed(2)}): valuta fusione` });
        }
      }
    }
    return { total: all.length, issues };
  } catch {
    return { total: 0, issues: [] };
  }
}

/** Potatura: elimina una skill. Throw se manca o nome invalido. */
export function pruneSkill(name: string): { pruned: string } {
  const clean = String(name ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9\-_]{0,40}$/.test(clean)) throw new Error(`nome skill invalido: ${String(name).slice(0, 60)}`);
  const dir = join(skillsDir(), clean);
  if (!existsSync(join(dir, "SKILL.md"))) throw new Error(`skill non trovata: ${clean}`);
  rmSync(dir, { recursive: true, force: true });
  return { pruned: clean };
}

/**
 * Composizione: nuova skill-workflow che riusa skill esistenti.
 * Le componenti devono esistere; le istruzioni citano come usarle in ordine.
 * Throw se invalida (stesse regole di create).
 */
export function composeSkill(name: string, description: string, from: string[], extra = ""): { name: string; path: string } {
  const parts = (Array.isArray(from) ? from : []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  if (parts.length < 2) throw new Error("compose vuole almeno 2 skill componenti");
  if (parts.length > 8) throw new Error("compose: max 8 componenti");
  const missing = parts.filter((p) => !getSkill(p));
  if (missing.length) throw new Error(`componenti assenti: ${missing.join(", ")}`);
  const steps = parts.map((p, i) => `${i + 1}. Applica la skill "${p}": ${getSkill(p)!.description || "vedi SKILL.md"}`).join("\n");
  const tail = String(extra ?? "").trim();
  const instructions = `Workflow composto da: ${parts.join(", ")}.\n${steps}${tail ? `\nNote: ${tail}` : ""}\nEsegui i passi in ordine; se uno fallisce, fermati e riporta.`;
  return createSkill(name, description, instructions);
}
