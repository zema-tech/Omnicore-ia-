// Agency — orchestrazione nativa di "agenzie agentiche" (Tappa 58).
// Un obiettivo → piano di ruoli → coda sul workboard (con dipendenze) → esecuzione
// per step con risultato → verdetto del reviewer → chiusura.
// Fonde: workboard (coda multi-agente), code agent (slice bounded), web read-only,
// LLM unificato e sessioni. Best-effort: mai throw verso il loop.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { board } from "./workboard.ts";
import { runTask } from "./code_agent.ts";
import { websearch } from "./websearch.ts";
import { web } from "./web.ts";
import { llmChat } from "../mind/llm.ts";
import { logMessage } from "./sessions.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export type AgencyRole = "research" | "code" | "ops" | "review";
export type AgencyState = "planned" | "running" | "done" | "fail";
export type AgencyStepState = "queued" | "running" | "done" | "fail";

export interface AgencyPlanStep {
  role: AgencyRole;
  task: string;
}

export interface AgencyStep extends AgencyPlanStep {
  boardTask: string;
  status: AgencyStepState;
  result: string;
}

export interface Agency {
  id: string;
  goal: string;
  owner: string;
  status: AgencyState;
  steps: AgencyStep[];
  created: number;
  updated: number;
}

export interface AgencyStepReport {
  boardTask: string;
  role: AgencyRole;
  task: string;
  ok: boolean;
  result: string;
}

export interface AgencyRunReport {
  ok: boolean;
  via: string;
  run: string;
  done: number;
  fail: number;
  steps: AgencyStepReport[];
  summary: string;
  error?: string;
}

export interface AgencyContext {
  workspace?: string;
  budgetSteps?: number;
}

export function agenciesFile(): string {
  return process.env["OMNICORE_AGENCIES_FILE"] ?? join(HERE, "..", "..", "data", "agencies.json");
}

function loadAll(): Agency[] {
  try {
    const raw = JSON.parse(readFileSync(agenciesFile(), "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((a): a is Agency => !!a && typeof (a as Agency).id === "string");
  } catch {
    return [];
  }
}

function saveAll(list: Agency[]): void {
  const file = agenciesFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(list, null, 2), "utf8");
}

function persist(ag: Agency): Agency {
  ag.updated = Date.now();
  const all = loadAll();
  const i = all.findIndex((a) => a.id === ag.id);
  if (i >= 0) all[i] = ag;
  else all.push(ag);
  saveAll(all);
  return ag;
}

export function agencyGet(id: string): Agency | null {
  return loadAll().find((a) => a.id === id) ?? null;
}

export function agencyList(): Agency[] {
  return loadAll().sort((a, b) => b.created - a.created);
}

const ROLE_RE = /^(research|code|ops|review)$/;

function cleanRole(v: unknown): AgencyRole | null {
  const s = String(v ?? "").trim().toLowerCase();
  return ROLE_RE.test(s) ? (s as AgencyRole) : null;
}

function cleanTask(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

// Piano di default quando l'LLM non è disponibile: ricerca → esecuzione → verifica.
export function fallbackPlan(goal: string): AgencyPlanStep[] {
  return [
    { role: "research", task: `Raccogli il contesto utile su: ${goal}` },
    { role: "code", task: goal },
    { role: "review", task: `Verifica il risultato rispetto all'obiettivo: ${goal}` },
  ];
}

/** Chiede all'LLM un piano di ruoli; se manca o risponde male usa l'euristica. */
export async function agencyPlan(goal: string): Promise<{ steps: AgencyPlanStep[]; via: string }> {
  const clean = goal.replace(/\s+/g, " ").trim();
  if (!clean) return { steps: [], via: "agency(no-goal)" };
  const system =
    "Sei il pianificatore di Omnicore. Scomponi l'obiettivo in 1-6 step con i ruoli: " +
    "research (raccogliere contesto), code (eseguire modifiche/azioni tecniche), " +
    "ops (operazioni senza effetti collaterali), review (verificare il risultato). " +
    'Rispondi SOLO con un array JSON: [{"role":"research","task":"..."}]';
  const text = await llmChat(system, `Obiettivo: ${clean}`, 400);
  if (text) {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]) as unknown;
        if (Array.isArray(parsed)) {
          const steps: AgencyPlanStep[] = [];
          for (const item of parsed.slice(0, 6)) {
            const role = cleanRole((item as { role?: unknown })?.role);
            const task = cleanTask((item as { task?: unknown })?.task);
            if (role && task) steps.push({ role, task });
          }
          if (steps.length) return { steps, via: "agency(llm-plan)" };
        }
      } catch {
        // piano non parsabile: si passa all'euristica
      }
    }
  }
  return { steps: fallbackPlan(clean), via: "agency(heuristic-plan)" };
}

/**
 * Crea un'agenzia: pianifica (o accetta un piano esplicito) e accoda ogni step
 * sul workboard in catena (lo step N dipende dallo step N-1).
 */
export async function agencyCreate(
  goal: string,
  opts: { steps?: AgencyPlanStep[]; roles?: AgencyRole[]; owner?: string } = {},
): Promise<Agency> {
  const clean = goal.replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("obiettivo agenzia vuoto");

  let plan: AgencyPlanStep[];
  if (opts.steps?.length) {
    plan = [];
    for (const s of opts.steps.slice(0, 8)) {
      const role = cleanRole(s?.role);
      const task = cleanTask(s?.task);
      if (role && task) plan.push({ role, task });
    }
  } else if (opts.roles?.length) {
    plan = [];
    for (const r of opts.roles.slice(0, 8)) {
      const role = cleanRole(r);
      if (role) plan.push({ role, task: clean });
    }
  } else {
    plan = (await agencyPlan(clean)).steps;
  }
  if (!plan.length) throw new Error("piano agenzia vuoto");

  const id = `agy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const owner = String(opts.owner ?? `agency-${id}`).slice(0, 60);
  const steps: AgencyStep[] = [];
  let prev: string | undefined;
  for (const p of plan) {
    const t = board.add(`${p.role}: ${p.task}`, {
      priority: 6,
      dependsOn: prev ? [prev] : undefined,
      payload: `agency=${id} role=${p.role} goal=${clean}`.slice(0, 2000),
    });
    steps.push({ role: p.role, task: p.task, boardTask: t.id, status: "queued", result: "" });
    prev = t.id;
  }

  const ag: Agency = {
    id,
    goal: clean,
    owner,
    status: "planned",
    steps,
    created: Date.now(),
    updated: Date.now(),
  };
  try {
    logMessage(null, {
      text: `agenzia ${id}: ${clean}`,
      parent: id,
      agent: owner,
      role: "subagent",
      ok: true,
      answer: `piano: ${steps.map((s) => s.role).join(" → ")}`,
    });
  } catch {
    // sessione non registrata: non blocca la creazione
  }
  return persist(ag);
}

function digestStep(
  role: AgencyRole,
  task: string,
  ctx: AgencyContext,
  previous: string,
): Promise<{ ok: boolean; result: string }> {
  if (role === "research") return runResearch(task);
  if (role === "review") return runReview(task, previous);
  if (role === "ops") {
    return Promise.resolve({
      ok: true,
      result: `ops "${task.slice(0, 120)}": nessun effetto collaterale dall'agenzia (usa channel/cron dedicati)`,
    });
  }
  return runCode(task, ctx);
}

async function runResearch(task: string): Promise<{ ok: boolean; result: string }> {
  const found = await websearch.search(task, { maxResults: 4 });
  if (!found.ok || !found.results.length) {
    return { ok: false, result: `ricerca senza risultati (${found.error ?? found.provider ?? "nessun provider"})` };
  }
  const parts: string[] = [];
  for (const hit of found.results.slice(0, 2)) {
    const page = await web.fetch(hit.url);
    const body = page.ok && page.page ? page.page.text.slice(0, 600) : hit.snippet;
    parts.push(`- ${hit.title} (${hit.url}): ${body}`);
  }
  const text = parts.join("\n").slice(0, 2000);
  try {
    logMessage(null, { text: task, parent: "agency", agent: "research", role: "subagent", ok: true, answer: text });
  } catch {
    // sessione best-effort
  }
  return { ok: true, result: text };
}

async function runCode(task: string, ctx: AgencyContext): Promise<{ ok: boolean; result: string }> {
  const r = await runTask(task, { workspace: ctx.workspace, budgetSteps: ctx.budgetSteps ?? 4 });
  const files = Array.isArray(r.filesTouched) && r.filesTouched.length ? ` [file: ${r.filesTouched.join(", ")}]` : "";
  return { ok: !!r.ok, result: `${r.ok ? "ok" : "fail"}: ${String(r.summary ?? "").slice(0, 900)}${files}` };
}

async function runReview(task: string, previous: string): Promise<{ ok: boolean; result: string }> {
  const system =
    "Sei il reviewer di Omnicore. Valuta se il lavoro prodotto raggiunge l'obiettivo. " +
    "Rispondi iniziando con 'OK:' oppure 'KO:' seguito da una motivazione breve.";
  const text = await llmChat(system, `Obiettivo: ${task}\n\nLavoro prodotto:\n${previous.slice(0, 3000)}`, 300);
  if (!text) {
    return { ok: true, result: "reviewer senza LLM: verdetto non disponibile, step considerato ok" };
  }
  const ko = /^\s*ko\b/i.test(text) || /\bko:/i.test(text.slice(0, 80));
  return { ok: !ko, result: text.slice(0, 1000) };
}

/** Il prossimo task che il workboard assegnerebbe (priorità DESC, poi created ASC). */
function nextReady(): string | null {
  const list = board.list();
  const byId = new Map(list.map((t) => [t.id, t]));
  const ready = list
    .filter((t) => t.status === "queued")
    .filter((t) => t.dependsOn.every((d) => byId.get(d)?.status === "done"))
    .sort((a, b) => b.priority - a.priority || a.created - b.created);
  return ready[0]?.id ?? null;
}

/**
 * Esegue l'agenzia un passo alla volta: prende il task pronto dalla coda,
 * lo esegue per ruolo, registra il risultato sul board e aggiorna lo stato.
 * Nessun demone: si ferma quando la coda dell'agenzia è finita o fallisce.
 */
export async function agencyRun(id: string, opts: AgencyContext = {}): Promise<AgencyRunReport> {
  const run = `agency-${id}`;
  const empty: AgencyRunReport = { ok: false, via: "agency(native)", run, done: 0, fail: 0, steps: [], summary: "" };
  const ag = agencyGet(id);
  if (!ag) return { ...empty, summary: `agenzia non trovata: ${id}`, error: "not-found" };

  const reports: AgencyStepReport[] = [];
  let done = 0;
  let fail = 0;
  const maxSteps = Math.max(1, ag.steps.length);

  for (let guard = 0; guard < maxSteps; guard++) {
    const step = ag.steps.find((s) => s.status === "queued");
    if (!step) break;

    const expecting = nextReady();
    if (expecting !== step.boardTask) {
      step.status = "fail";
      step.result = `coda non allineata: atteso ${step.boardTask}, pronto ${expecting ?? "nessuno"}`;
      ag.status = "fail";
      fail++;
      reports.push({ boardTask: step.boardTask, role: step.role, task: step.task, ok: false, result: step.result });
      persist(ag);
      break;
    }

    step.status = "running";
    ag.status = "running";
    persist(ag);

    let claimed: string | null = null;
    try {
      claimed = board.claim(ag.owner)?.id ?? null;
    } catch {
      claimed = null;
    }
    if (claimed !== step.boardTask) {
      step.status = "fail";
      step.result = `claim non riuscito (${claimed ?? "nullo"})`;
      ag.status = "fail";
      reports.push({ boardTask: step.boardTask, role: step.role, task: step.task, ok: false, result: step.result });
      persist(ag);
      fail++;
      break;
    }

    const previous = ag.steps
      .filter((s) => s.result)
      .map((s) => `[${s.role}] ${s.result}`)
      .join("\n");
    const outcome = await digestStep(step.role, step.task, opts, previous);
    step.status = outcome.ok ? "done" : "fail";
    step.result = outcome.result.slice(0, 2000);
    if (outcome.ok) done++;
    else fail++;
    board.done(step.boardTask, outcome.ok, step.result);
    reports.push({ boardTask: step.boardTask, role: step.role, task: step.task, ok: outcome.ok, result: step.result });
    persist(ag);
    if (!outcome.ok) {
      ag.status = "fail";
      break;
    }
  }

  if (ag.status !== "fail") ag.status = ag.steps.every((s) => s.status === "done") ? "done" : "running";
  persist(ag);

  const summary = `agenzia ${id}: ${done} ok, ${fail} ko — ${ag.steps
    .map((s) => `${s.role}(${s.status})`)
    .join(" → ")}`;
  return { ok: fail === 0 && done > 0, via: "agency(native)", run, done, fail, steps: reports, summary };
}

export function agencyStatus(id?: string): {
  ok: boolean;
  via: string;
  agencies: { id: string; goal: string; status: AgencyState; steps: { role: AgencyRole; status: AgencyStepState }[] }[];
  board?: ReturnType<typeof board.status>;
  error?: string;
} {
  try {
    const all = id ? agencyList().filter((a) => a.id === id) : agencyList();
    return {
      ok: true,
      via: "agency(native)",
      agencies: all.slice(0, 20).map((a) => ({
        id: a.id,
        goal: a.goal.slice(0, 200),
        status: a.status,
        steps: a.steps.map((s) => ({ role: s.role, status: s.status })),
      })),
      board: board.status(),
    };
  } catch (e) {
    return { ok: false, via: "agency(native)", agencies: [], error: String(e).slice(0, 200) };
  }
}

export const agency = {
  file: agenciesFile,
  list: agencyList,
  get: agencyGet,
  plan: agencyPlan,
  create: agencyCreate,
  run: agencyRun,
  status: agencyStatus,
};
