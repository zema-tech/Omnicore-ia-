// Agent loop Omnicore — politica deterministica + tool unificati.
// Non è più "route → prodotto". È: osserva → scegli tool Omnicore → agisci → rispondi.
// Quando colleghi un LLM, sostituisci plan() con una chiamata modello che emette ToolCall[].
import { route } from "../router.ts";
import { SYSTEM_PROMPT, banner } from "./identity.ts";
import { runTool, type ToolCall, type ToolResult } from "./tools.ts";
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
  plan: ToolCall[];
  trace: ToolResult[];
  reply: string;
  system: string;
}

/** Pianificazione minima (senza LLM). Sostituibile con CLM rank o LLM tool-calling. */
export function plan(userText: string): { intent: string; calls: ToolCall[] } {
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

/** Un turno agente completo: plan → facoltà → sintesi naturale (LLM o euristica). */
export async function runAgent(
  userText: string,
  opts: { directory?: string } = {},
): Promise<AgentResult> {
  const { intent, calls } = plan(userText);
  const trace: ToolResult[] = [];

  for (const call of calls) {
    const result = await runTool(call, { text: userText, directory: opts.directory });
    trace.push(result);
  }

  const mind = await synthesize(userText, intent, toSteps(trace));
  const respond = await runTool({ name: "respond", args: { text: mind.answer } }, { text: userText });
  trace.push(respond);

  return {
    agent: banner(),
    text: userText,
    intent,
    plan: calls,
    trace,
    reply: mind.answer,
    system: SYSTEM_PROMPT.slice(0, 200) + "…",
  };
}
