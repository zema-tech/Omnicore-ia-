// Agent loop Omnicore — piano (LLM o keyword) → facoltà → sintesi.
// Il piano vive in plan.ts; la sintesi in mind/synth.ts.
import { SYSTEM_PROMPT, banner } from "./identity.ts";
import { runTool, type ToolCall, type ToolResult } from "./tools.ts";
import { resolvePlan } from "./plan.ts";
import { decideVerify } from "../decide/index.ts";
import { DESTRUCTIVE_TOOLS, attemptKey } from "../decide/rules.ts";
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
/** Traccia tool → step minds: la sintesi parla una sola lingua. */
function toSteps(trace: ToolResult[]): FuseStep[] {
  const pick = (n: string) => trace.find((t) => t.name === n);
  const mem = pick("memory.search") ?? pick("memory.read");
  const cod = pick("code.run");
  const ch = pick("channel.announce") ?? pick("channel.status");
  const step = (s: "brain" | "hands" | "face", t: ToolResult | undefined): FuseStep =>
    t
      ? { step: s, via: t.via, ok: t.ok, ...(t.ok ? { result: t.data } : { error: t.error ?? "?" }) }
      : { step: s, via: "omnicore [skip]", ok: true, result: "skipped" };
  return [step("brain", mem), step("hands", cod), step("face", ch)];
}

/** Un turno agente completo: piano (LLM o keyword) → facoltà → sintesi. */
export async function runAgent(
  userText: string,
  opts: { directory?: string } = {},
): Promise<AgentResult> {
  const { intent, calls: planned, planner } = await resolvePlan(userText);
  const gates = moduleGates();
  // Profilo: world.exec esiste solo in medium/alt.
  const calls = applyUserConfirm(
    planned.filter((c) => c.name !== "world.exec" || gates.world),
    userText,
  );
  const trace: ToolResult[] = [];
  const failedKeys: string[] = [];

  for (const call of calls) {
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
        trace.push({ name: call.name, ok: false, via: `decide(${v.level})`, error: `bloccata: ${v.verdict.reason}` });
        continue;
      }
    }
    const result = await runTool(call, { text: userText, directory: opts.directory });
    trace.push(result);
    if (!result.ok) failedKeys.push(attemptKey(call));
  }

  const mind = await synthesize(userText, intent, toSteps(trace));
  const respond = await runTool({ name: "respond", args: { text: mind.answer } }, { text: userText });
  trace.push(respond);

  return {
    agent: banner(),
    text: userText,
    intent,
    planner,
    plan: calls,
    trace,
    reply: mind.answer,
    system: SYSTEM_PROMPT.slice(0, 200) + "…",
  };
}
