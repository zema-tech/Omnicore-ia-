// Agent loop Omnicore — piano (LLM o keyword) → facoltà → sintesi.
// Il piano vive in plan.ts; la sintesi in mind/synth.ts.
import { SYSTEM_PROMPT, banner } from "./identity.ts";
import { runTool, type ToolCall, type ToolResult } from "./tools.ts";
import { resolvePlan } from "./plan.ts";
import { decideVerify } from "../decide/index.ts";
import { DESTRUCTIVE_TOOLS, attemptKey } from "../decide/rules.ts";
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
  const { intent, calls, planner } = await resolvePlan(userText);
  const trace: ToolResult[] = [];
  const failedKeys: string[] = [];

  for (const call of calls) {
    // Decide: le azioni distruttive passano da verify (cascata rules→jev→clm).
    if ((DESTRUCTIVE_TOOLS as string[]).includes(call.name) && call.args?.confirm !== true) {
      const v = await decideVerify(call, { state: userText, recentAttempts: failedKeys });
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
