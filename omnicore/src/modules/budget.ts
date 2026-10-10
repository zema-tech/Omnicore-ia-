// Modulo BUDGET — controllo costi LLM (tracking + alert + fallback cheap).
// Ogni chiamata registrata in data/llm_usage.jsonl (una riga JSON):
// {ts, model, via, promptTokens, completionTokens, ms}. Token reali da
// `usage` OpenAI quando presenti, altrimenti stima chars/4.
// Budget: OMNICORE_BUDGET_TOKENS_DAY (0 = illimitato). Alert all'80%.
// Oltre budget: modello cheap (OMNICORE_LLM_CHEAP_MODEL) se configurato,
// altrimenti stop -> euristica. Zero dipendenze. Mai throw.
import { appendFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export interface UsageEntry {
  ts: number;
  model: string;
  via: string;
  promptTokens: number;
  completionTokens: number;
  estimated: boolean;
  ms: number;
}

export function usageFile(): string {
  return process.env["OMNICORE_USAGE_FILE"] ?? join(HERE, "..", "..", "data", "llm_usage.jsonl");
}

export function budgetTokensDay(): number {
  return Math.max(0, Number(process.env["OMNICORE_BUDGET_TOKENS_DAY"] ?? "0"));
}

export function cheapModel(): string {
  return process.env["OMNICORE_LLM_CHEAP_MODEL"] ?? "";
}

/** Stima token quando il provider non dichiara usage. */
export function estimateTokens(text: string): number {
  return Math.ceil(String(text ?? "").length / 4);
}

/** Registra una chiamata. Mai throw. */
export function recordUsage(e: Omit<UsageEntry, "ts">): void {
  try {
    const f = usageFile();
    mkdirSync(dirname(f), { recursive: true });
    appendFileSync(f, JSON.stringify({ ts: Date.now(), ...e }) + "\n");
  } catch { /* tracking mai fatale */ }
}

function todayKey(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function readDay(): UsageEntry[] {
  try {
    if (!existsSync(usageFile())) return [];
    const today = todayKey();
    return readFileSync(usageFile(), "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as UsageEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is UsageEntry => !!e && todayKey(e.ts) === today && typeof e.promptTokens === "number");
  } catch {
    return [];
  }
}

export interface BudgetStatus {
  day: string;
  usedTokens: number;
  budgetTokens: number;
  pct: number | null;
  calls: number;
  alert80: boolean;
  over: boolean;
  cheap: string;
}

/** Stato budget di oggi. Mai throw. */
export function budgetStatus(): BudgetStatus {
  try {
    const rows = readDay().filter((r) => r.via !== "local"); // locale = gratis, fuori budget
    const used = rows.reduce((n, r) => n + r.promptTokens + r.completionTokens, 0);
    const budget = budgetTokensDay();
    const pct = budget > 0 ? used / budget : null;
    return {
      day: todayKey(),
      usedTokens: used,
      budgetTokens: budget,
      pct,
      calls: rows.length,
      alert80: pct !== null && pct >= 0.8 && pct < 1,
      over: pct !== null && pct >= 1,
      cheap: cheapModel(),
    };
  } catch {
    return { day: todayKey(), usedTokens: 0, budgetTokens: 0, pct: null, calls: 0, alert80: false, over: false, cheap: "" };
  }
}

/**
 * Gate prima di chiamare l'LLM: {allowed, model} — model sostituito col cheap
 * oltre budget, allowed=false se oltre budget senza cheap. Mai throw.
 */
export function budgetGate(model: string): { allowed: boolean; model: string; reason: string } {
  try {
    const st = budgetStatus();
    if (!st.over) return { allowed: true, model, reason: "dentro budget" };
    const cheap = cheapModel();
    if (cheap && cheap !== model) return { allowed: true, model: cheap, reason: `budget esaurito: fallback ${cheap}` };
    return { allowed: false, model, reason: "budget giornaliero esaurito (euristica)" };
  } catch {
    return { allowed: true, model, reason: "budget illeggibile: passo" };
  }
}

export const budget = { file: usageFile, record: recordUsage, status: budgetStatus, gate: budgetGate, estimate: estimateTokens };
