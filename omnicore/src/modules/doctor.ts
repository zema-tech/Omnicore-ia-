// Omnicore doctor — diagnostica nativa stile `hermes doctor`, solo Omnicore.
// Controlli locali veloci + probe LLM opzionale, fix sicuri, mai throw.
// Ogni check: {id, label, level, detail, hint?}. Exit CLI: 0 ok/warn, 1 se ko.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.ts";
import { llmDoctor, type DoctorResult } from "../mind/llm.ts";
import { listSkills } from "./skills.ts";
import { channelStatus } from "./channels.ts";

export type CheckLevel = "ok" | "warn" | "ko";

export interface DoctorCheck {
  id: string;
  label: string;
  level: CheckLevel;
  detail: string;
  hint?: string;
}

export interface DoctorReport extends DoctorResult {
  checks: DoctorCheck[];
  profile: string;
  node: string;
  workspace: string;
  skills: number;
  fixed: string[];
}

const HERE = dirname(fileURLToPath(import.meta.url)); // omnicore/src/modules
const OMNI = join(HERE, "..", ".."); // omnicore/

function check(
  id: string,
  label: string,
  fn: () => { level: CheckLevel; detail: string; hint?: string },
): DoctorCheck {
  try {
    const r = fn();
    return { id, label, ...r };
  } catch (e) {
    return { id, label, level: "ko", detail: String(e).slice(0, 200) };
  }
}

function nodeCheck(): DoctorCheck {
  return check("node", "Node.js", () => {
    const m = process.version.match(/^v(\d+)/);
    const major = m ? Number(m[1]) : 0;
    if (major >= 22) return { level: "ok", detail: `${process.version} (>=22)` };
    return {
      level: "ko",
      detail: `${process.version}: serve Node >=22`,
      hint: "installa Node 22+ o imposta OMNICORE_NODE",
    };
  });
}

function configCheck(): DoctorCheck {
  return check("config", "Configurazione", () => {
    const c = loadConfig(); // non lancia mai
    const from = process.env["OMNICORE_PROFILE"]
      ? "env OMNICORE_PROFILE"
      : "default/config";
    return { level: "ok", detail: `profilo ${c.profile} (${from}), provider ${c.llmProvider}` };
  });
}

function securityCheck(): DoctorCheck {
  return check("sicurezza", "Sicurezza API", () => {
    if (process.env["OMNICORE_API_TOKEN"]) {
      return { level: "ok", detail: "OMNICORE_API_TOKEN impostato (Bearer attivo)" };
    }
    return {
      level: "warn",
      detail: "OMNICORE_API_TOKEN non impostato: le API rispondono 401 fail-closed",
      hint: "genera con: python3 -c \"import secrets; print(secrets.token_hex(32))\"",
    };
  });
}

function workspaceCheck(): DoctorCheck {
  return check("workspace", "Workspace", () => {
    const root = process.env["OMNICORE_WORKSPACE"] ?? process.cwd();
    const probe = join(root, `.omnicore-doctor-${process.pid}`);
    try {
      writeFileSync(probe, "ok");
      rmSync(probe);
    } catch {
      return {
        level: "ko",
        detail: `non scrivibile: ${root}`,
        hint: "controlla permessi o imposta OMNICORE_WORKSPACE",
      };
    }
    return { level: "ok", detail: `scrivibile: ${root}` };
  });
}

function dataCheck(): DoctorCheck {
  return check("dati", "Dati locali", () => {
    const data = join(OMNI, "data");
    if (!existsSync(data)) {
      return {
        level: "warn",
        detail: "cartella data/ assente (creata al primo uso o con --fix)",
        hint: "npm run doctor -- --fix",
      };
    }
    const sess = join(data, "sessions.json");
    if (existsSync(sess)) {
      try {
        JSON.parse(readFileSync(sess, "utf8"));
      } catch {
        return { level: "ko", detail: "sessions.json illeggibile", hint: "backup e rigenera: sposta il file, si ricrea da solo" };
      }
    }
    return { level: "ok", detail: "data/ ok, sessions.json leggibile" };
  });
}

function skillsCheck(): DoctorCheck {
  return check("skill", "Skill pack", () => {
    const n = listSkills().length;
    if (n === 0) {
      return { level: "warn", detail: "nessuna skill in omnicore/skills/", hint: "controlla OMNICORE_SKILLS_DIR" };
    }
    return { level: "ok", detail: `${n} pack caricati` };
  });
}

function channelsCheck(): DoctorCheck {
  return check("canali", "Canali", () => {
    const st = channelStatus();
    const extra = st.filter((c) => c.id !== "console");
    return {
      level: "ok",
      detail: extra.length ? `console + ${extra.map((c) => c.id).join(", ")}` : "solo console (log locale)",
    };
  });
}

function budgetCheck(): DoctorCheck {
  return check("budget", "Budget LLM", () => {
    const raw = process.env["OMNICORE_BUDGET_TOKENS_DAY"] ?? "";
    if (!raw) return { level: "ok", detail: "illimitato (OMNICORE_BUDGET_TOKENS_DAY non impostato)" };
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      return { level: "warn", detail: `valore non valido: ${raw}`, hint: "usa un intero > 0 o rimuovi la var" };
    }
    return { level: "ok", detail: `${n} token/giorno` };
  });
}

function llmCheck(d: DoctorResult): DoctorCheck {
  return {
    id: "llm",
    label: "Cervello LLM",
    level: d.active === "euristica" ? "warn" : "ok",
    detail:
      d.active === "euristica"
        ? "nessun backend: risposte euristiche offline"
        : `${d.active} risponde (${d.active === "api" ? d.api.ms : d.local.ms}ms)`,
    hint:
      d.active === "euristica"
        ? "imposta OMNICORE_LLM_BASE_URL + KEY, o avvia Ollama"
        : undefined,
  };
}

/** Fix sicuri e non distruttivi: crea dir/file mancanti. Mai throw. */
function applyFix(): string[] {
  const fixed: string[] = [];
  try {
    const data = join(OMNI, "data");
    if (!existsSync(data)) {
      mkdirSync(data, { recursive: true });
      fixed.push("creata cartella data/");
    }
    const vault = join(data, "vault");
    if (!existsSync(vault)) {
      mkdirSync(vault, { recursive: true });
      fixed.push("creata cartella data/vault/");
    }
  } catch {
    /* best-effort: il report mostra i ko restanti */
  }
  return fixed;
}

export interface DoctorOpts {
  live?: boolean;
  fix?: boolean;
}

/** Report completo. Con live=false salta le probe di rete. Mai throw. */
export async function runDoctor(opts: DoctorOpts = {}): Promise<DoctorReport> {
  const live = opts.live ?? true;
  let llm: DoctorResult;
  try {
    llm = live
      ? await llmDoctor()
      : {
          provider: loadConfig().llmProvider,
          api: { ok: false, ms: 0, detail: "probe saltata (--offline)" },
          local: { ok: false, ms: 0, detail: "probe saltata (--offline)" },
          active: "euristica",
        };
  } catch (e) {
    llm = {
      provider: "api",
      api: { ok: false, ms: 0, detail: String(e).slice(0, 160) },
      local: { ok: false, ms: 0, detail: "non provato" },
      active: "euristica",
    };
  }
  const fixed = opts.fix ? applyFix() : [];
  const checks = [
    nodeCheck(),
    configCheck(),
    securityCheck(),
    workspaceCheck(),
    dataCheck(),
    skillsCheck(),
    channelsCheck(),
    budgetCheck(),
    llmCheck(llm),
  ];
  let skills = 0;
  try {
    skills = listSkills().length;
  } catch {
    /* già nel check */
  }
  return {
    ...llm,
    checks,
    profile: loadConfig().profile,
    node: process.version,
    workspace: process.env["OMNICORE_WORKSPACE"] ?? process.cwd(),
    skills,
    fixed,
  };
}

/** Riga per check, con simboli sobri (niente emoji). */
function line(c: DoctorCheck): string {
  const mark = c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "✗";
  const extra = c.hint ? `\n    → ${c.hint}` : "";
  return `${mark} ${c.label}: ${c.detail}${extra}`;
}

/** Formato umano per terminale. */
export function formatDoctorText(r: DoctorReport): string {
  const ok = r.checks.filter((c) => c.level === "ok").length;
  const warn = r.checks.filter((c) => c.level === "warn").length;
  const ko = r.checks.filter((c) => c.level === "ko").length;
  const fixed = r.fixed.length ? `\nFix applicati: ${r.fixed.join("; ")}` : "";
  return [
    `Omnicore doctor — ${ok} ok, ${warn} avvisi, ${ko} errori`,
    ...r.checks.map(line),
    `cervello attivo: ${r.active}${fixed}`,
  ].join("\n");
}

export const doctor = { run: runDoctor, formatText: formatDoctorText };
