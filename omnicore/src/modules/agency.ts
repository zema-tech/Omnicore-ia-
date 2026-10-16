// Modulo AGENCY minima (Tappa 60) — "un solo agente" che parallelizza sé stesso:
// split di un obiettivo in 2-3 sub-task + fanout esistente (modules/agents.ts).
// Mai throw verso il chiamante: ogni errore diventa report {ok:false}.
import { agentFanout } from "./agents.ts";
import type { FanoutItem, FanoutReport } from "./agents.ts";

export interface AgencyPlan {
  goal: string;
  items: FanoutItem[];
}

export interface AgencyReport extends AgencyPlan {
  report: FanoutReport;
  ok: boolean;
  summary: string;
}

/** Split euristico di un obiettivo in 2-3 sub-task indipendenti. */
export function splitGoal(goal: string): FanoutItem[] {
  const g = goal.trim();
  const items: FanoutItem[] = [
    { role: "research", task: `contesto e fonti per: ${g}` },
    { role: "code", task: `implementa: ${g}` },
  ];
  if (g.length > 140) items.push({ role: "code", task: `verifica e test per: ${g}` });
  return items;
}

/** Esegue un'agenzia minima: split + fanout. Mai throw. */
export async function runAgency(
  goal: string,
  opts: { workspace?: string; budgetSteps?: number } = {},
): Promise<AgencyReport> {
  const g = goal.trim();
  if (!g) {
    const empty: FanoutReport = { run: "agency-vuota", ok: false, results: [], summary: "obiettivo vuoto" };
    return { goal: g, items: [], report: empty, ok: false, summary: "obiettivo vuoto" };
  }
  try {
    const items = splitGoal(g);
    const report = await agentFanout(items, { workspace: opts.workspace, budgetSteps: opts.budgetSteps });
    return { goal: g, items, report, ok: report.ok, summary: `agency: ${report.summary}` };
  } catch (e) {
    const fail: FanoutReport = {
      run: "agency-errore",
      ok: false,
      results: [],
      summary: `eccezione: ${String(e).slice(0, 160)}`,
    };
    return { goal: g, items: [], report: fail, ok: false, summary: fail.summary };
  }
}

export const agency = { split: splitGoal, run: runAgency };
