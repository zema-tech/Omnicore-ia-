// Piano Omnicore: LLM tool-calling con fallback al router a parole chiave.
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

  calls.push({ name: "memory.search", args: { query: userText, limit: 5 } });

  const url = userText.match(/https?:\/\/[^\s"'“”<>]+/)?.[0];
  if (url) calls.push({ name: "web.fetch", args: { url } });

  if (intent === "code") {
    const g = userText.match(/(?:cerca|trova|cercami|grep)\s+(.+?)\s+nei\s+file/i);
    if (g?.[1]) {
      calls.push({ name: "code.grep", args: { pattern: g[1].trim().replace(/^["“]|["”]$/g, "") } });
    } else {
      // Claude Code path: multi-step agent, non un singolo code.run
      calls.push({ name: "code.task", args: { goal: userText } });
    }
  } else if (intent === "ops") {
    calls.push({ name: "channel.status", args: {} });
  }

  return { intent, calls };
}

const PLAN_SYSTEM = `Sei il pianificatore di Omnicore. Rispondi con SOLO JSON, nessun altro testo.
Formato: [{"name": "<tool>", "args": {...}}], max 3 tool, in ordine di esecuzione.
Tool ammessi: memory.search {query, limit}, memory.read {session_key, limit},
memory.store {content, session, tags}, memory.recall {query, limit}, memory.forget {id},
memory.embed {text, model},
memory.note_save {title, body}, memory.note_search {query, limit},
code.task {goal} (Claude Code multi-step: preferisci per task di codice),
code.run {prompt}, code.read {path}, code.write {path, content}, code.shell {cmd},
code.edit {path, oldText, newText}, code.glob {pattern}, code.grep {pattern},
code.symbols {}, code.definition {symbol}, code.references {symbol},
code.lsp {command, method, file, line} (conferma),
todo.add {text}, todo.list {}, todo.done {id}, todo.clear {},
web.fetch {url},
web.search {query, maxResults, provider},
research.deep {query, maxSources, depth},
cookbook.scan {}, cookbook.recommend {}, cookbook.serve {model} (conferma),
channel.status {}, channel.announce {message, targets},
telegram.me {}, telegram.poll {offset, timeout},
discord.send {channel, text}, discord.listen {timeout}, slack.send {channel, text},
mcp.list {}, mcp.call {server, tool, args}, mcp.reload {} (conferma),
budget.status {},
cron.add {name, schedule, payload}, cron.list {}, cron.remove {name},
agents.register {name, skills}, agents.list {}, agents.pause {name},
agents.run {name, task} (secondario file-worker, conferma),
agents.fanout {items} (paralleli + coordinatore, conferma),
permissions.request {action, target}, permissions.respond {id, allow},
skills.list {}, skills.get {name}, skills.search {query},
skills.create {name, description, instructions} (conferma),
skills.audit {}, skills.prune {name} (conferma), skills.compose {name, description, from} (conferma),
world.exec {cmd}, decide.rank {candidati}, decide.verify {azione}, respond vietato.
Per codice multi-file o "crea/scrivi/fix": usa code.task. Per saluti basta memory.search.`;

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

export async function planWithLlm(userText: string, chat = llmChatVia): Promise<ToolCall[] | null> {
  try {
    const r = await chat(PLAN_SYSTEM, userText, 300);
    if (!r) return null;
    return parsePlan(r.text);
  } catch {
    return null;
  }
}

const FOLLOWUP_SYSTEM = `Sei il pianificatore di Omnicore in un ciclo osserva→agisci.
Ricevi l'obiettivo utente e le OSSERVAZIONI dagli step appena eseguiti.
Rispondi con SOLO JSON, nessun altro testo.
Formato: [{"name": "<tool>", "args": {...}}], max 3 tool, in ordine.
Stessi tool del primo piano. Se l'obiettivo è raggiunto o non c'è più
niente di utile da fare, rispondi esattamente [].
Non ripetere tool già riusciti con lo stesso risultato.`;

function parseFollowup(raw: string): ToolCall[] | null {
  const clean = raw.replace(/```json|```/g, "").trim();
  if (clean === "[]") return [];
  const calls = parsePlan(raw);
  if (calls === null) return null;
  return calls;
}

/** Osservazioni compatte dagli ultimi risultati (ciò che il modello vede). */
export function summarizeTrace(trace: { name: string; ok: boolean; via: string; data?: unknown; error?: string }[]): string {
  if (!trace.length) return "(nessuno step eseguito)";
  return trace
    .slice(-6)
    .map((t) => {
      const s = t.ok ? JSON.stringify(t.data ?? "") : `ERRORE: ${t.error ?? "?"}`;
      return `- ${t.name} (${t.ok ? "ok" : "ko"}, ${t.via}): ${s.slice(0, 300)}`;
    })
    .join("\n");
}

/**
 * Piano di continuazione: osserva i risultati, decide i prossimi tool o [].
 * Ritorna null se nessun LLM (il loop resta a giro singolo). Mai throw.
 */
export async function planFollowup(
  userText: string,
  intent: string,
  observations: string,
  chat = llmChatVia,
): Promise<ToolCall[] | null> {
  try {
    const r = await chat(FOLLOWUP_SYSTEM, `Obiettivo: ${userText}\nIntento: ${intent}\nOSSERVAZIONI:\n${observations}`, 300);
    if (!r) return null;
    return parseFollowup(r.text);
  } catch {
    return null;
  }
}

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
