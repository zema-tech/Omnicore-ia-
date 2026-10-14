// Coding agent multi-step — stile Claude Code / Codex, 100% nativo.
// Due pianificatori: euristico offline (sempre disponibile) + LLM multi-step
// (quando OMNICORE_LLM_* è attivo). Mai throw: offline/fail -> euristica.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  readFile,
  writeFile,
  listDir,
  runShell,
  resolveInRoot,
  workspaceRoot,
} from "./workspace.ts";

export type CodeStepKind =
  | "list"
  | "read"
  | "write"
  | "edit"
  | "shell"
  | "grep"
  | "glob"
  | "done";

export interface CodeStep {
  kind: CodeStepKind;
  path?: string;
  content?: string;
  cmd?: string;
  /** grep: pattern da cercare (regex o testo). glob: pattern file. */
  pattern?: string;
  /** edit: testo da trovare / sostituzione. */
  find?: string;
  replace?: string;
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
  timeline: string[];
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
 * Resta il fallback quando l'LLM è spento o fallisce.
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

// ---------------------------------------------------------------------------
// Attuatori nativi in jail (grep / glob / edit vivono qui: zero dipendenze)
// ---------------------------------------------------------------------------

function walkFiles(root: string, rel: string, out: string[]): void {
  const abs = join(root, rel);
  let names: string[];
  try {
    names = readdirSync(abs);
  } catch {
    return;
  }
  for (const n of names) {
    if (n === "node_modules" || n === ".git" || n === "dist") continue;
    const childRel = rel === "." ? n : `${rel}/${n}`;
    let isDir = false;
    try {
      isDir = statSync(join(root, childRel)).isDirectory();
    } catch {
      continue;
    }
    if (isDir) walkFiles(root, childRel, out);
    else out.push(childRel);
  }
}

function globToRegExp(pattern: string): RegExp {
  // *, ** e ? in stile shell, il resto letterale.
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i++;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

function nativeGrep(
  pattern: string,
  root: string,
  base = ".",
  maxHits = 30,
): { ok: boolean; output: string } {
  try {
    const abs = resolveInRoot(base, root);
    void abs;
    const rel0 = base === "." ? "." : base;
    const files: string[] = [];
    walkFiles(root, rel0, files);
    const rx = new RegExp(pattern, "i");
    const hits: string[] = [];
    for (const f of files) {
      if (hits.length >= maxHits) break;
      let text = "";
      try {
        text = readFileSync(join(root, f), "utf8");
      } catch {
        continue;
      }
      const lines = text.split("\n");
      for (let i = 0; i < lines.length && hits.length < maxHits; i++) {
        if (rx.test(lines[i])) hits.push(`${f}:${i + 1}:${lines[i].slice(0, 120)}`);
      }
    }
    return { ok: true, output: hits.length ? hits.join("\n") : "(nessuna occorrenza)" };
  } catch (e) {
    return { ok: false, output: String(e).slice(0, 200) };
  }
}

function nativeGlob(
  pattern: string,
  root: string,
  base = ".",
  maxHits = 50,
): { ok: boolean; output: string } {
  try {
    const rel0 = base === "." ? "." : base;
    const files: string[] = [];
    walkFiles(root, rel0, files);
    const pats = pattern
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const rxs = (pats.length ? pats : ["**"]).map(globToRegExp);
    const hits = files.filter((f) => rxs.some((rx) => rx.test(f)));
    const names = files.map((f) => f.split("/").pop() ?? f);
    const loose = new Set(hits);
    for (const f of files) {
      if (loose.size >= maxHits) break;
      if (rxs.some((rx) => rx.test(f.split("/").pop() ?? ""))) loose.add(f);
    }
    void names;
    const list = [...loose].slice(0, maxHits);
    return { ok: true, output: list.length ? list.join("\n") : "(nessun file)" };
  } catch (e) {
    return { ok: false, output: String(e).slice(0, 200) };
  }
}

function nativeEdit(
  userPath: string,
  find: string,
  replace: string,
  root: string,
): { ok: boolean; output: string } {
  const r = readFile(userPath, root);
  if (!r.ok) return { ok: false, output: r.output };
  if (!find) return { ok: false, output: "edit senza 'find': niente da sostituire" };
  const idx = r.output.indexOf(find);
  if (idx < 0) return { ok: false, output: "testo 'find' non trovato nel file" };
  const next = r.output.slice(0, idx) + replace + r.output.slice(idx + find.length);
  if (next.length > 200_000) {
    return { ok: false, output: "risultato troppo grande (max 200KB)" };
  }
  const w = writeFile(userPath, next, root);
  return w.ok
    ? { ok: true, output: `sostituita 1 occorrenza in ${userPath}` }
    : { ok: false, output: w.output };
}

/** Esegue un singolo step nel workspace jail. Mai throw. */
export async function execCodeStep(
  step: CodeStep,
  root: string,
): Promise<CodeStep> {
  try {
    switch (step.kind) {
      case "done":
        return { kind: "done", ok: true, output: "piano completato" };
      case "list": {
        const r = listDir(step.path ?? ".", root);
        return { ...step, ok: r.ok, output: r.output };
      }
      case "read": {
        const r = readFile(step.path ?? ".", root);
        return { ...step, ok: r.ok, output: r.output };
      }
      case "write": {
        const p = step.path ?? "omnicore-out.txt";
        const r = writeFile(p, step.content ?? "", root);
        return { ...step, path: p, ok: r.ok, output: r.output };
      }
      case "edit": {
        const r = nativeEdit(step.path ?? "", step.find ?? "", step.replace ?? "", root);
        return { ...step, ok: r.ok, output: r.output };
      }
      case "shell": {
        const r = await runShell(step.cmd ?? "true", { root });
        return { ...step, ok: r.ok, output: r.output };
      }
      case "grep": {
        const r = nativeGrep(step.pattern ?? "", root, step.path ?? ".");
        return { ...step, ok: r.ok, output: r.output };
      }
      case "glob": {
        const r = nativeGlob(step.pattern ?? "**", root, step.path ?? ".");
        return { ...step, ok: r.ok, output: r.output };
      }
      default:
        return { ...step, kind: "done", ok: true, output: "step ignoto: chiudo" };
    }
  } catch (e) {
    return { ...step, ok: false, output: String(e).slice(0, 200) };
  }
}

// ---------------------------------------------------------------------------
// Loop LLM multi-step (best-effort, mai throw)
// ---------------------------------------------------------------------------

export type LlmStepProposer = (
  goal: string,
  history: CodeStep[],
  budgetLeft: number,
) => Promise<CodeStep | null>;

let testProposer: LlmStepProposer | null = null;

/** Iniezione mock per i test unitari. Mai usata in produzione. */
export function __setCodeLlmProposerForTest(fn: LlmStepProposer | null): void {
  testProposer = fn;
}

/** Vero se la configurazione LLM è presente (loop LLM tentabile). */
export function isCodeLlmActive(): boolean {
  return Boolean(
    testProposer ?? (process.env["OMNICORE_LLM_BASE_URL"] ?? "").trim(),
  );
}

const CODE_SYSTEM = [
  "Sei il pianificatore di un coding agent nativo. Rispondi con UN SOLO oggetto JSON, niente altro.",
  'Forme valide: {"kind":"list","path":"."} {"kind":"read","path":"f"} {"kind":"write","path":"f","content":"..."}',
  '{"kind":"edit","path":"f","find":"vecchio","replace":"nuovo"} {"kind":"shell","cmd":"..."}',
  '{"kind":"grep","pattern":"testo","path":"."} {"kind":"glob","pattern":"*.ts","path":"."} {"kind":"done"}',
  "Passi piccoli e verificabili: dopo write/edit proponi read/grep di verifica. done quando il goal è raggiunto.",
].join("\n");

function parseLlmStep(text: string): CodeStep | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const kind = String(j["kind"] ?? "");
  const str = (v: unknown): string | undefined =>
    typeof v === "string" ? v : undefined;
  const base: CodeStep | null =
    kind === "list"
      ? { kind: "list", path: str(j["path"]) ?? "." }
      : kind === "read"
        ? { kind: "read", path: str(j["path"]) ?? "." }
        : kind === "write"
          ? { kind: "write", path: str(j["path"]) ?? "omnicore-out.txt", content: str(j["content"]) ?? "" }
          : kind === "edit"
            ? { kind: "edit", path: str(j["path"]), find: str(j["find"]), replace: str(j["replace"]) ?? "" }
            : kind === "shell"
              ? { kind: "shell", cmd: str(j["cmd"]) }
              : kind === "grep"
                ? { kind: "grep", pattern: str(j["pattern"]), path: str(j["path"]) ?? "." }
                : kind === "glob"
                  ? { kind: "glob", pattern: str(j["pattern"]) ?? "**", path: str(j["path"]) ?? "." }
                  : kind === "done"
                    ? { kind: "done" }
                    : null;
  if (!base) return null;
  if ((base.kind === "read" || base.kind === "edit") && !base.path) return null;
  if (base.kind === "shell" && !base.cmd) return null;
  if (base.kind === "grep" && !base.pattern) return null;
  return base;
}

async function fetchLlmStep(
  goal: string,
  history: CodeStep[],
  budgetLeft: number,
): Promise<CodeStep | null> {
  if (testProposer) {
    try {
      return await testProposer(goal, history, budgetLeft);
    } catch {
      return null;
    }
  }
  const baseUrl = (process.env["OMNICORE_LLM_BASE_URL"] ?? "").replace(/\/$/, "");
  if (!baseUrl) return null;
  const model =
    process.env["OMNICORE_LLM_MODEL"] ?? "omnicore-fusion";
  const apiKey = process.env["OMNICORE_LLM_API_KEY"] ?? "";
  const timeoutMs = Number(process.env["OMNICORE_LLM_TIMEOUT"] ?? "20000");
  const hist = history
    .slice(-8)
    .map(
      (s) =>
        `- ${s.kind}${s.path ? ` ${s.path}` : ""}${s.cmd ? ` \`${s.cmd}\`` : ""} → ${s.ok ? "ok" : "ko"}: ${String(s.output ?? "").replace(/\s+/g, " ").slice(0, 200)}`,
    )
    .join("\n");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: CODE_SYSTEM },
          {
            role: "user",
            content: `Goal: ${goal}\nPassi rimasti: ${budgetLeft}\nStoria:\n${hist || "(nessuno step ancora)"}\nProssimo step JSON:`,
          },
        ],
        max_tokens: 500,
        temperature: 0.2,
      }),
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = j?.choices?.[0]?.message?.content ?? "";
    return parseLlmStep(text);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function summarize(goal: string, steps: CodeStep[]): string {
  const parts = steps
    .filter((s) => s.kind !== "done")
    .map((s) => `${s.kind}${s.path ? `:${s.path}` : ""}${s.ok === false ? " FAIL" : ""}`);
  return parts.length
    ? `Code agent su “${goal.slice(0, 80)}”: ${parts.join(" → ")}`
    : `Nessuno step utile per: ${goal.slice(0, 80)}`;
}

function toTimeline(steps: CodeStep[]): string[] {
  return steps
    .filter((s) => s.kind !== "done")
    .map((s) => {
      const mark = s.ok === false ? "✗" : "✓";
      const target = s.path
        ? ` ${s.path}`
        : s.cmd
          ? ` \`${s.cmd}\``
          : s.pattern
            ? ` /${s.pattern}/`
            : "";
      const out = s.output
        ? ` — ${String(s.output).replace(/\s+/g, " ").slice(0, 80)}`
        : "";
      return `${mark} ${s.kind}${target}${out}`;
    });
}

/** Loop multi-step guidato dal modello, con fallback euristico. Mai throw. */
async function runLlmLoop(
  goal: string,
  root: string,
  budget: number,
  via: string,
): Promise<CodeAgentResult> {
  const steps: CodeStep[] = [];
  const filesTouched: string[] = [];
  let failed = false;
  for (let i = 0; i < budget; i++) {
    let next: CodeStep | null = null;
    try {
      next = await fetchLlmStep(goal, steps, budget - i);
    } catch {
      next = null;
    }
    if (!next) {
      // modello muto: chiudi onestamente, o euristica se nessuno step
      if (!steps.length) return runHeuristic(goal, root, budget, `${via}+heuristic-fallback`);
      break;
    }
    const done = await execCodeStep(next, root);
    steps.push(done);
    if ((done.kind === "write" || done.kind === "edit") && done.ok && done.path) {
      filesTouched.push(done.path);
    }
    if (done.ok === false) failed = true;
    if (done.kind === "done") break;
  }
  if (!steps.some((s) => s.kind === "done")) {
    steps.push({ kind: "done", ok: true, output: "budget esaurito" });
  }
  return {
    ok: !failed,
    summary: summarize(goal, steps),
    steps,
    filesTouched,
    timeline: toTimeline(steps),
    via,
  };
}

/** Piano euristico (Tappa 10, invariato nel comportamento). Mai throw. */
async function runHeuristic(
  goal: string,
  root: string,
  budget: number,
  via: string,
): Promise<CodeAgentResult> {
  // il budget taglia gli step utili; `done` è sempre garantito in coda
  const body = planCodeSteps(goal)
    .filter((s) => s.kind !== "done")
    .slice(0, budget);
  const plan = [...body, { kind: "done" } as CodeStep];
  const steps: CodeStep[] = [];
  const filesTouched: string[] = [];
  let failed = false;

  for (const step of plan) {
    const done = await execCodeStep(step, root);
    steps.push(done);
    if ((done.kind === "write" || done.kind === "edit") && done.ok && done.path) {
      filesTouched.push(done.path);
    }
    if (done.ok === false) failed = true;
    if (done.kind === "done") break;
  }

  return {
    ok: !failed,
    summary: summarize(goal, steps),
    steps,
    filesTouched,
    timeline: toTimeline(steps),
    via,
  };
}

/**
 * Esegue il piano step-by-step nel workspace.
 * Con OMNICORE_LLM_BASE_URL attivo (o proposer di test): loop LLM multi-step.
 * Offline / fail: fallback euristico. Mai throw.
 */
export async function runCodeAgent(
  input: CodeAgentInput,
  opts: { propose?: LlmStepProposer } = {},
): Promise<CodeAgentResult> {
  const root = workspaceRoot(input.workspace);
  const budget = Math.max(1, Math.min(input.budgetSteps ?? 8, 20));
  const goal = input.goal?.trim() || "elenca i file";
  try {
    const prev = testProposer;
    if (opts.propose) testProposer = opts.propose;
    try {
      if (isCodeLlmActive()) {
        return await runLlmLoop(goal, root, budget, "code(agent-llm)");
      }
      return await runHeuristic(goal, root, budget, "code(agent-native)");
    } finally {
      if (opts.propose) testProposer = prev;
    }
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

