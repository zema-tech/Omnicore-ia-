// Agent loop Omnicore — piano (LLM o keyword) → facoltà → sintesi.
// Il piano vive in plan.ts; la sintesi in mind/synth.ts.
import { SYSTEM_PROMPT, banner } from "./identity.ts";
import { runTool, type ToolCall, type ToolResult } from "./tools.ts";
import { resolvePlan, planFollowup, summarizeTrace } from "./plan.ts";
import { learnFromTurn } from "../modules/memories.ts";
import { decideVerify } from "../decide/index.ts";
import { DESTRUCTIVE_TOOLS, attemptKey } from "../decide/rules.ts";
import { approvalRequest, approvalGet, approvalRespond } from "../modules/permissions.ts";
import { moduleGates } from "../config.ts";
import { synthesize } from "../mind/synth.ts";
import type { FuseStep } from "../pipeline.ts";

export interface AgentTurn {
  role: "user" | "omnicore" | "tool";
  content: string;
  tool?: ToolResult;
}

export interface AgentResult {
  agent: string;
  text: string;
  intent: string;
  planner: "llm" | "keyword";
  plan: ToolCall[];
  trace: ToolResult[];
  reply: string;
  system: string;
  /** Giri osserva→agisci eseguiti (1 = giro singolo, niente LLM o già fatto). */
  rounds: number;
  /** Vero se l'utente ha interrotto il turno (shouldAbort). */
  aborted: boolean;
  /** Fatti appresi e salvati in memoria in questo turno. */
  learned: number;
}

/** Eventi live del loop (streaming): token, tool_start/end, loop_end. */
export type LoopEvent =
  | { event: "tool_start"; name: string }
  | { event: "tool_end"; name: string; ok: boolean }
  | { event: "token"; text: string }
  | { event: "loop_end"; rounds: number; planner: "llm" | "keyword" };

export interface RunAgentOpts {
  directory?: string;
  onEvent?: (e: LoopEvent) => void;
  /** Prelazione: se torna true, il giro si ferma dopo il tool corrente. */
  shouldAbort?: () => boolean;
}

/** Frasi con cui l'utente conferma esplicitamente ("confermo: ...", "sì, procedi"). */
const CONFIRM_RE = /\b(conferm\w*|vai pure|procedi pure|esegui pure|s[iì][, ]?\s*(procedi|esegui|vai)|do it|autorizzo)\b/i;

/** La conferma vale solo se la dice l'UTENTE: quella del modello viene azzerata. */
export function applyUserConfirm(calls: ToolCall[], userText: string): ToolCall[] {
  const userConfirmed = CONFIRM_RE.test(userText);
  return calls.map((c) =>
    (DESTRUCTIVE_TOOLS as string[]).includes(c.name)
      ? { ...c, args: { ...(c.args ?? {}), confirm: userConfirmed } }
      : c,
  );
}
/** Anteprima leggibile di un'azione per approval e reply. */
function previewOf(call: ToolCall): string {
  const a = call.args ?? {};
  const pick = (...keys: string[]) => {
    for (const k of keys) if (a[k] !== undefined && a[k] !== "") return String(a[k]);
    return "";
  };
  const p = pick("prompt", "message", "cmd", "path", "query", "text", "name") || JSON.stringify(a);
  return `${call.name}: ${p}`.slice(0, 300);
}

/** "approvo <id>" / "nego <id>": l'umano decide su un'azione registrata. */
const APPROVE_RE = /\b(approv\w*|nego|nega|rifiut\w*)\s+(appr-[\w-]+)/i;

async function handleApprovalAnswer(
  userText: string,
  opts: { directory?: string },
): Promise<AgentResult | null> {
  const m = userText.match(APPROVE_RE);
  if (!m) return null;
  const allow = /^(approv)/i.test(m[1]);
  const id = m[2];
  const trace: ToolResult[] = [];
  const found = approvalGet(id);
  if (!found) {
    const reply = `Non trovo approvazioni con id ${id}: forse è di un'altra sessione o è già stata archiviata. Descrivimi pure l'azione da capo.`;
    trace.push({ name: "permissions.respond", ok: false, via: "permissions", error: reply });
    return { agent: banner(), text: userText, intent: "ops", planner: "keyword", plan: [], trace, reply, system: SYSTEM_PROMPT.slice(0, 200) + "…", rounds: 1, aborted: false, learned: 0 };
  }
  if (found.status !== "open") {
    const reply = `L'approvazione ${id} è già stata decisa (${found.status}): nessuna doppia esecuzione.`;
    trace.push({ name: "permissions.respond", ok: false, via: "permissions", error: reply });
    return { agent: banner(), text: userText, intent: "ops", planner: "keyword", plan: [], trace, reply, system: SYSTEM_PROMPT.slice(0, 200) + "…", rounds: 1, aborted: false, learned: 0 };
  }
  approvalRespond(id, allow);
  if (!allow || !found.call) {
    const reply = allow
      ? `Approvazione ${id} registrata, ma senza azione eseguibile collegata: niente da fare.`
      : `Azione ${id} negata e archiviata: non è stato eseguito nulla.`;
    trace.push({ name: "permissions.respond", ok: true, via: "permissions", data: { id, allow } });
    return { agent: banner(), text: userText, intent: "ops", planner: "keyword", plan: [], trace, reply, system: SYSTEM_PROMPT.slice(0, 200) + "…", rounds: 1, aborted: false, learned: 0 };
  }
  // Via umana confermata: esegue l'azione registrata (conferma forzata, decide già passato).
  const exec = await runTool(
    { name: found.call.name as ToolCall["name"], args: { ...found.call.args, confirm: true } },
    { text: userText, directory: opts.directory },
  );
  trace.push(exec);
  const reply = exec.ok
    ? `Approvato ed eseguito ${id} (${found.call.name}): ${shortResult(exec)}.`
    : `Approvato ${id}, ma l'esecuzione è fallita: ${String(exec.error ?? "?").slice(0, 300)}`;
  return { agent: banner(), text: userText, intent: "ops", planner: "keyword", plan: [], trace, reply, system: SYSTEM_PROMPT.slice(0, 200) + "…", rounds: 1, aborted: false, learned: 0 };
}

function shortResult(t: ToolResult): string {
  const d = t.data;
  const s = typeof d === "string" ? d : JSON.stringify(d ?? "");
  return s.slice(0, 300);
}
/** Traccia tool → step minds: la sintesi parla una sola lingua. */
function toSteps(trace: ToolResult[]): FuseStep[] {
  const pick = (n: string) => trace.find((t) => t.name === n);
  const mem = pick("memory.search") ?? pick("memory.read");
  const cod = pick("code.run") ?? pick("code.task");
  const ch = pick("channel.announce") ?? pick("channel.status");
  // Extra (web.fetch, code.grep...): il meglio va nel contesto memoria,
  // così la sintesi li vede senza cambiare forma degli step.
  const consumed = new Set(["memory.search", "memory.read", "code.run", "channel.announce", "channel.status", "respond"]);
  const extras = trace
    .filter((t) => !consumed.has(t.name) && t.ok && t.data !== undefined)
    .map((t) => `[${t.name} via ${t.via}] ${shortResult(t)}`);
  const step = (s: "brain" | "hands" | "face", t: ToolResult | undefined): FuseStep =>
    t
      ? { step: s, via: t.via, ok: t.ok, ...(t.ok ? { result: t.data } : { error: t.error ?? "?" }) }
      : { step: s, via: "omnicore [skip]", ok: true, result: "skipped" };
  const steps = [step("brain", mem), step("hands", cod), step("face", ch)];
  if (extras.length && steps[0].ok) {
    steps[0] = { ...steps[0], result: `${JSON.stringify(steps[0].result ?? "").slice(0, 1500)}\n${extras.join("\n").slice(0, 2500)}` };
  }
  return steps;
}

/** Un turno agente completo: giri osserva→agisci (ReAct) → sintesi. */
export async function runAgent(
  userText: string,
  opts: RunAgentOpts = {},
): Promise<AgentResult> {
  const emit = (e: LoopEvent) => {
    try {
      opts.onEvent?.(e);
    } catch { /* listener mai fatale */ }
  };
  // Dipendenza umana: "approvo/nego <id>" decide su azioni registrate, prima di tutto.
  const approvalTurn = await handleApprovalAnswer(userText, opts);
  if (approvalTurn) {
    emit({ event: "loop_end", rounds: 1, planner: "keyword" });
    return approvalTurn;
  }

  const { intent, calls: planned, planner } = await resolvePlan(userText);
  const gates = moduleGates();
  const trace: ToolResult[] = [];
  const failedKeys: string[] = [];
  const allCalls: ToolCall[] = [];
  let rounds = 0;
  let aborted = false;
  const isAborted = (): boolean => {
    try {
      return opts.shouldAbort?.() === true;
    } catch {
      return false;
    }
  };

  // Un giro: filtri profilo/conferma → decide sulle distruttive → esecuzione.
  const runCalls = async (incoming: ToolCall[]): Promise<void> => {
    // Profilo: world.exec esiste solo in medium/alt.
    const calls = applyUserConfirm(
      incoming.filter((c) => c.name !== "world.exec" || gates.world),
      userText,
    );
    allCalls.push(...calls);
    for (const call of calls) {
      // Prelazione: completa il giro al prossimo confine, non a metà tool.
      if (isAborted()) {
        aborted = true;
        trace.push({ name: "abort", ok: false, via: "omnicore", error: "turno interrotto dall'utente: mi fermo qui" });
        break;
      }
      emit({ event: "tool_start", name: call.name });
      // Decide: le azioni distruttive passano sempre da verify (la conferma
      // utente abilita, ma loop/offline restano bloccati).
      if ((DESTRUCTIVE_TOOLS as string[]).includes(call.name)) {
        const v = await decideVerify(call, {
          state: userText,
          recentAttempts: failedKeys,
          allowClm: gates.clm,
          confirm: call.args?.confirm === true,
        });
        if (v.verdict.verdict !== "allow") {
          // Review = serve l'umano: registra l'azione in approvazione con id.
          // Deny = errore reale, niente approval (non potrebbe mai riuscire).
          if (v.verdict.verdict === "review") {
            const req = approvalRequest(
              call.name,
              previewOf(call),
              v.verdict.reason,
              { name: call.name, args: (call.args ?? {}) as Record<string, unknown> },
            );
            trace.push({ name: call.name, ok: false, via: `decide(${v.level})+permissions`, error: `in attesa di approvazione ${req.id}: ${v.verdict.reason}` });
          } else {
            trace.push({ name: call.name, ok: false, via: `decide(${v.level})`, error: `bloccata: ${v.verdict.reason}` });
          }
          emit({ event: "tool_end", name: call.name, ok: false });
          continue;
        }
      }
      const result = await runTool(call, { text: userText, directory: opts.directory });
      trace.push(result);
      emit({ event: "tool_end", name: call.name, ok: result.ok });
      if (!result.ok) failedKeys.push(attemptKey(call));
    }
  };

  await runCalls(planned);
  rounds++;

  // Continuazione ReAct: solo con LLM (l'euristica resta a giro singolo).
  // Budget anti-loop: OMNICORE_MAX_ROUNDS giri totali (default 4, max 10).
  const maxRounds = Math.max(1, Math.min(Number(process.env["OMNICORE_MAX_ROUNDS"] ?? "4"), 10));
  let mark = 0;
  while (planner === "llm" && rounds < maxRounds && !aborted) {
    const next = await planFollowup(userText, intent, summarizeTrace(trace.slice(mark)));
    mark = trace.length;
    if (!next || next.length === 0) break;
    await runCalls(next);
    rounds++;
  }

  const mind = await synthesize(userText, intent, toSteps(trace), (t) => emit({ event: "token", text: t }));
  const respond = await runTool({ name: "respond", args: { text: mind.answer } }, { text: userText });
  trace.push(respond);
  emit({ event: "loop_end", rounds, planner });

  // Memoria attiva: impara fatti espliciti dal turno (best-effort, mai fatale).
  let learned = 0;
  try {
    learned = (await learnFromTurn(userText)).saved;
  } catch { /* mai fatale */ }

  return {
    agent: banner(),
    text: userText,
    intent,
    planner,
    plan: allCalls,
    trace,
    reply: aborted ? `Mi sono fermato su tua richiesta. ${mind.answer}` : mind.answer,
    system: SYSTEM_PROMPT.slice(0, 200) + "…",
    rounds,
    aborted,
    learned,
  };
}
