// Bridge — Claude Code di Omnicore nel runtime agent.
// Collega packages/code (organo multi-step) al tool surface senza OpenCode.
// Ispirazione UX: Rakazo / invisible_dots (timeline step, workspace, approve),
// implementazione 100% nativa (jail file+shell).
import { runCodeAgent, type CodeAgentResult } from "../../../packages/code/src/index.ts";

export type { CodeAgentResult, CodeStep } from "../../../packages/code/src/index.ts";

/** Esegue il coding agent multi-step. Mai throw. */
export async function runTask(
  goal: string,
  opts: { workspace?: string; budgetSteps?: number } = {},
): Promise<CodeAgentResult> {
  try {
    return await runCodeAgent({
      goal: String(goal || "").trim() || "elenca i file",
      workspace: opts.workspace,
      budgetSteps: opts.budgetSteps ?? 8,
    });
  } catch (e) {
    return {
      ok: false,
      summary: `code agent fallito: ${String(e).slice(0, 200)}`,
      steps: [],
      filesTouched: [],
      via: "code(agent-native)",
    };
  }
}

/** Formato compatto per chat / dashboard (timeline stile Claude Code). */
export function formatTimeline(r: CodeAgentResult): string {
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
