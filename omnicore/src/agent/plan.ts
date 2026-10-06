// Piano Omnicore: LLM tool-calling con fallback al router a parole chiave.
//
// resolvePlan() prova prima l'LLM (se un provider risponde), altrimenti usa
// planKeyword() — deterministico, offline, sempre disponibile.
// L'LLM emette SOLO JSON: [{"name": tool, "args": {...}}]; nomi validati
// contro TOOL_CATALOG, "respond" escluso (lo aggiunge il loop).
import { route } from "../router.ts";
import { llmChatVia } from "../mind/llm.ts";
import { TOOL_CATALOG, type ToolCall } from "./tools.ts";

export interface ResolvedPlan {
  intent: string;
  calls: ToolCall[];
  planner: "llm" | "keyword";
}

const VALID = new Set(TOOL_CATALOG.map((t) => t.name));

/** Pianificazione deterministica offline (fallback garantito). */
export function planKeyword(userText: string): { intent: string; calls: ToolCall[] } {
  const { intent } = route({ text: userText });
  const calls: ToolCall[] = [];

  // Sempre prova memoria leggera (best-effort)
  calls.push({ name: "memory.search", args: { query: userText, limit: 5 } });

  if (intent === "code") {
    calls.push({ name: "code.run", args: { prompt: userText } });
  } else if (intent === "ops") {
    calls.push({ name: "channel.status", args: {} });
  }
  // chat / memory: solo recall + respond

  return { intent, calls };
}

const PLAN_SYSTEM = `Sei il pianificatore di Omnicore. Rispondi con SOLO JSON, nessun altro testo.
Formato: [{"name": "<tool>", "args": {...}}], max 3 tool, in ordine di esecuzione.
Tool ammessi: memory.search {query, limit}, memory.read {session_key, limit},
code.run {prompt}, channel.status {}, channel.announce {message, targets},
world.exec {cmd}, decide.rank {candidati}, decide.verify {azione}, respond vietato.
Scegli solo tool utili alla richiesta; per saluti basta memory.search.`;

function parsePlan(raw: string): ToolCall[] | null {
  const clean = raw.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  let arr: unknown;
  try {
    arr = JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const calls: ToolCall[] = [];
  for (const item of arr.slice(0, 3)) {
    if (typeof item !== "object" || item === null) return null;
    const { name, args } = item as { name?: unknown; args?: unknown };
    if (typeof name !== "string" || !VALID.has(name as never) || name === "respond") return null;
    if (args !== undefined && (typeof args !== "object" || args === null)) return null;
    calls.push({ name: name as ToolCall["name"], args: (args ?? {}) as Record<string, unknown> });
  }
  return calls.length ? calls : null;
}

/** Piano via LLM. Ritorna null se nessun provider o risposta non valida. Mai throw. */
export async function planWithLlm(userText: string, chat = llmChatVia): Promise<ToolCall[] | null> {
  try {
    const r = await chat(PLAN_SYSTEM, userText, 300);
    if (!r) return null;
    return parsePlan(r.text);
  } catch {
    return null;
  }
}

/** Piano risolto: LLM se possibile, keyword altrimenti. Mai throw. */
export async function resolvePlan(userText: string): Promise<ResolvedPlan> {
  const { intent } = route({ text: userText });
  try {
    const calls = await planWithLlm(userText);
    if (calls) return { intent, calls, planner: "llm" };
  } catch {
    /* fallback */
  }
  const kw = planKeyword(userText);
  return { intent: kw.intent, calls: kw.calls, planner: "keyword" };
}
