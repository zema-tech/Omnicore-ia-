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
import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
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

export const skills = { dir: skillsDir, list: listSkills, get: getSkill, search: searchSkills, create: createSkill };

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
