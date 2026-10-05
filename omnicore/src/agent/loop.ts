// Agent loop Omnicore — politica deterministica + tool unificati.
// Non è più "route → prodotto". È: osserva → scegli tool Omnicore → agisci → rispondi.
// Quando colleghi un LLM, sostituisci plan() con una chiamata modello che emette ToolCall[].
import { route } from "../router.ts";
import { SYSTEM_PROMPT, banner, OMNICORE_NAME } from "./identity.ts";
import { runTool, type ToolCall, type ToolResult } from "./tools.ts";

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

function synthesize(userText: string, intent: string, trace: ToolResult[]): string {
  const lines: string[] = [];
  lines.push(`${OMNICORE_NAME} — intent percepito: ${intent}`);

  for (const t of trace) {
    if (t.name === "respond") continue;
    if (t.ok) {
      const preview =
        typeof t.data === "string"
          ? t.data.slice(0, 280)
          : JSON.stringify(t.data)?.slice(0, 280) ?? "ok";
      lines.push(`• ${t.name} [${t.via}]: ${preview}`);
    } else {
      lines.push(`• ${t.name} [${t.via}]: offline/errore — ${t.error ?? "?"}`);
    }
  }

  if (intent === "code") {
    const code = trace.find((t) => t.name === "code.run");
    if (code?.ok) lines.push("Ho lavorato sul task di codice con il motore coding interno.");
    else lines.push("Il motore coding non era raggiungibile; riprova con opencode serve o la CLI.");
  } else if (intent === "memory" || intent === "chat") {
    lines.push("Ho consultato la memoria interna. Dimmi se vuoi approfondire una sessione.");
  } else if (intent === "ops") {
    lines.push("Ho controllato lo stato della presenza/canali.");
  }

  lines.push(`(richiesta: ${userText.slice(0, 120)})`);
  return lines.join("\n");
}

/** Un turno agente completo. */
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

  const reply = synthesize(userText, intent, trace);
  const respond = await runTool({ name: "respond", args: { text: reply } }, { text: userText });
  trace.push(respond);

  return {
    agent: banner(),
    text: userText,
    intent,
    plan: calls,
    trace,
    reply,
    system: SYSTEM_PROMPT.slice(0, 200) + "…",
  };
}
