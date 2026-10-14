// Bridge — Claude Code di Omnicore nel runtime agent.
// Collega packages/code (organo multi-step, euristico o LLM) al tool surface.
// Ispirazione UX: Rakazo / invisible_dots (timeline step, workspace, approve),
// implementazione 100% nativa (jail file+shell).
import { runCodeAgent, type CodeAgentResult } from "../../../packages/code/src/index.ts";

export type { CodeAgentResult, CodeStep } from "../../../packages/code/src/index.ts";

function defaultBudget(): number {
  const n = Number(process.env["OMNICORE_CODE_BUDGET_STEPS"] ?? "8");
  return Number.isFinite(n) && n > 0 ? Math.min(20, Math.floor(n)) : 8;
}

/**
 * Esegue il coding agent multi-step. Mai throw.
 * Con OMNICORE_LLM_* attivo il loop è guidato dal modello (multi-step con
 * verifica); offline o in fail resta l'euristica. Ritorno invariato:
 * ok, summary, steps, filesTouched, timeline.
 */
export async function runTask(
  goal: string,
  opts: { workspace?: string; budgetSteps?: number } = {},
): Promise<CodeAgentResult> {
  try {
    return await runCodeAgent({
      goal: String(goal || "").trim() || "elenca i file",
      workspace: opts.workspace,
      budgetSteps: opts.budgetSteps ?? defaultBudget(),
    });
  } catch (e) {
    return {
      ok: false,
      summary: `code agent fallito: ${String(e).slice(0, 200)}`,
      steps: [],
      filesTouched: [],
      timeline: [],
      via: "code(agent-native)",
    };
  }
}

/** Formato compatto per chat / dashboard (timeline stile Claude Code). */
export function formatTimeline(r: CodeAgentResult): string {
  if (r.timeline?.length) {
    const lines = r.timeline.map((t, i) => `${i + 1}. ${t}`);
    const files = r.filesTouched?.length ? `\nFile: ${r.filesTouched.join(", ")}` : "";
    return `${r.summary}${lines.length ? "\n" + lines.join("\n") : ""}${files}`;
  }
  const lines = (r.steps ?? [])
    .filter((s) => s.kind !== "done")
    .map((s, i) => {
      const mark = s.ok === false ? "✗" : "✓";
      const target = s.path ? ` ${s.path}` : s.cmd ? ` \`${s.cmd}\`` : "";
      const out = s.output ? ` — ${String(s.output).replace(/\s+/g, " ").slice(0, 80)}` : "";
      return `${i + 1}. ${mark} ${s.kind}${target}${out}`;
    });
  const files = r.filesTouched?.length ? `\nFile: ${r.filesTouched.join(", ")}` : "";
  return `${r.summary}${lines.length ? "\n" + lines.join("\n") : ""}${files}`;
}

export const codeAgent = { runTask, formatTimeline };
