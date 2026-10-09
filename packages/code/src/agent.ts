// Coding agent multi-step — stile Claude Code / Codex, 100% nativo.
// plan euristico → read | list | write | shell | done. Mai throw.
import { readFile, writeFile, listDir, runShell, workspaceRoot } from "./workspace.ts";

export type CodeStepKind = "list" | "read" | "write" | "shell" | "done";

export interface CodeStep {
  kind: CodeStepKind;
  path?: string;
  content?: string;
  cmd?: string;
  ok?: boolean;
  output?: string;
}

export interface CodeAgentInput {
  goal: string;
  workspace?: string;
  budgetSteps?: number;
}

export interface CodeAgentResult {
  ok: boolean;
  summary: string;
  steps: CodeStep[];
  filesTouched: string[];
  via: string;
}

const QUOTED = /[`'"“”]([^`'"“”]+)[`'"“”]/;

/** Estrae un path grezzo dal goal. */
function guessPath(goal: string): string | null {
  const q = goal.match(QUOTED);
  if (q?.[1] && /[/\\.]/.test(q[1])) return q[1].trim();
  const m = goal.match(
    /(?:file|path|percorso|in|su|di|crea|scrivi|genera|leggi|apri|mostra|vedi|creare)\s+[`'"“]?([\w./\\-]+\.[a-z][a-z0-9]{0,7})[`'"“]?/i,
  );
  if (m?.[1]) return m[1];
  // fallback: nome file libero nel goal (estensione che inizia per lettera,
  // così "python 3.11" non diventa un path)
  const bare = goal.match(/\b([\w][\w./\\-]*\.[a-z][a-z0-9]{0,7})\b/i);
  return bare?.[1] ?? null;
}

function guessWriteContent(goal: string): string {
  const m =
    goal.match(/(?:contenuto|testo|content)\s*:?\s*[`'"“]?([\s\S]+?)[`'"“]?\s*$/i) ??
    goal.match(/:\s*[`'"“]([^`'"“]+)[`'"“]/);
  if (m?.[1]?.trim()) return m[1].trim();
  // fallback: ultima parola dopo "con"
  const con = goal.match(/\bcon\s+(.+)$/i);
  return con?.[1]?.trim() || "# creato da Omnicore code agent\n";
}

function guessShell(goal: string): string | null {
  const m = goal.match(/(?:esegui|run|shell|comando)\s+[`'"“]([^`'"“]+)[`'"“]/i);
  return m?.[1]?.trim() ?? null;
}

/**
 * Pianificatore euristico offline: produce una lista di step dal goal.
 * Con LLM collegato (futuro) si sostituisce senza cambiare runCodeAgent.
 */
export function planCodeSteps(goal: string): CodeStep[] {
  const g = goal.trim();
  const steps: CodeStep[] = [];
  const path = guessPath(g);
  const shell = guessShell(g);

  const wantsList = /\b(elenca|lista|list|ls|albero|tree)\b/i.test(g);
  const wantsRead = /\b(leggi|read|mostra|apri|cat|vedi)\b/i.test(g);
  const wantsWrite = /\b(scrivi|crea|genera|write|create)\b/i.test(g);

  // sempre orientati: lista root se non c’è path chiaro e non è solo shell
  if (wantsList || (!path && !shell && !wantsWrite)) {
    steps.push({ kind: "list", path: "." });
  }
  if (wantsRead && path) {
    steps.push({ kind: "read", path });
  }
  if (wantsWrite) {
    const p = path ?? "omnicore-out.txt";
    steps.push({ kind: "write", path: p, content: guessWriteContent(g) });
    // verifica: rileggi sempre ciò che hai scritto
    steps.push({ kind: "read", path: p });
  }
  if (shell) {
    steps.push({ kind: "shell", cmd: shell });
  } else if (/\b(echo|npm |node |python |git )\b/i.test(g)) {
    // comando grezzo senza apici: prendi dalla prima keyword tool-like
    const raw = g.match(/\b((?:echo|npm|node|python3?|git)\b.+)$/i);
    if (raw) steps.push({ kind: "shell", cmd: raw[1].trim() });
  }

  if (!steps.length) {
    steps.push({ kind: "list", path: "." });
  }
  steps.push({ kind: "done" });
  return steps;
}

/** Esegue il piano step-by-step nel workspace. */
export async function runCodeAgent(input: CodeAgentInput): Promise<CodeAgentResult> {
  const root = workspaceRoot(input.workspace);
  const budget = Math.max(1, Math.min(input.budgetSteps ?? 8, 20));
  // il budget taglia gli step utili; `done` è sempre garantito in coda
  const body = planCodeSteps(input.goal)
    .filter((s) => s.kind !== "done")
    .slice(0, budget);
  const plan = [...body, { kind: "done" } as CodeStep];
  const steps: CodeStep[] = [];
  const filesTouched: string[] = [];
  let failed = false;

  for (const step of plan) {
    if (step.kind === "done") {
      steps.push({ kind: "done", ok: true, output: "piano completato" });
      break;
    }
    if (step.kind === "list") {
      const r = listDir(step.path ?? ".", root);
      steps.push({ ...step, ok: r.ok, output: r.output });
      if (!r.ok) failed = true;
      continue;
    }
    if (step.kind === "read") {
      const r = readFile(step.path ?? ".", root);
      steps.push({ ...step, ok: r.ok, output: r.output });
      if (!r.ok) failed = true;
      continue;
    }
    if (step.kind === "write") {
      const p = step.path ?? "omnicore-out.txt";
      const r = writeFile(p, step.content ?? "", root);
      steps.push({ ...step, path: p, ok: r.ok, output: r.output });
      if (r.ok) filesTouched.push(p);
      else failed = true;
      continue;
    }
    if (step.kind === "shell") {
      const r = await runShell(step.cmd ?? "true", { root });
      steps.push({ ...step, ok: r.ok, output: r.output });
      if (!r.ok) failed = true;
    }
  }

  const summaryParts = steps
    .filter((s) => s.kind !== "done")
    .map((s) => `${s.kind}${s.path ? `:${s.path}` : ""}${s.ok === false ? " FAIL" : ""}`);

  return {
    ok: !failed,
    summary: summaryParts.length
      ? `Code agent su “${input.goal.slice(0, 80)}”: ${summaryParts.join(" → ")}`
      : `Nessuno step utile per: ${input.goal.slice(0, 80)}`,
    steps,
    filesTouched,
    via: "code(agent-native)",
  };
}
