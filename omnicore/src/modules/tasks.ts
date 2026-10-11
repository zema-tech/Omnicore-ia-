// Modulo TASK — long-running agent tasks (stile OpenClaw primitives).
// Task persistente data/tasks.json: schedule → run (slice bounded con
// checkpoint) → resume (continua dal checkpoint) → finish.
// Scheduling temporale via runAt (ISO): l'esecuzione resta manuale o via
// cron (nessun demone: vedi cron module). Checkpoint = {slices, summary, files}.
// Zero dipendenze (solo code_agent nativo).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runTask } from "./code_agent.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIA = "task(native)";

export type TaskStatus = "scheduled" | "running" | "done" | "fail" | "cancelled";
export interface Checkpoint { slices: number; summary: string; files: string[] }
export interface LTask {
  id: string; goal: string; status: TaskStatus;
  runAt: number; note: string;
  checkpoint: Checkpoint;
  attempts: number; created: number; updated: number;
}

export function tasksFile(): string {
  return process.env["OMNICORE_TASKS_FILE"] ?? join(HERE, "..", "..", "data", "tasks.json");
}

function loadAll(): Record<string, LTask> {
  try {
    const d = JSON.parse(readFileSync(tasksFile(), "utf8"));
    return d?.tasks && typeof d.tasks === "object" ? d.tasks : {};
  } catch {
    return {};
  }
}

function saveAll(t: Record<string, LTask>): void {
  const f = tasksFile();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ tasks: t }, null, 2));
}

/** Pianifica un task (subito o a runAt ISO futuro). Throw se goal vuoto. */
export function taskSchedule(goal: string, opts: { runAt?: string; note?: string } = {}): LTask {
  const g = String(goal ?? "").trim().slice(0, 500);
  if (!g) throw new Error("task.schedule vuole {goal}");
  let runAt = 0;
  if (opts.runAt) {
    runAt = Date.parse(opts.runAt);
    if (!Number.isFinite(runAt)) throw new Error(`runAt invalido (ISO): ${opts.runAt}`);
  }
  const all = loadAll();
  const id = `job-${Date.now().toString(36)}`;
  const t: LTask = {
    id, goal: g, status: "scheduled", runAt,
    note: String(opts.note ?? "").slice(0, 300),
    checkpoint: { slices: 0, summary: "", files: [] },
    attempts: 0, created: Date.now(), updated: Date.now(),
  };
  all[id] = t;
  saveAll(all);
  return t;
}

/** Elenco (filtro status opzionale). Mai throw. */
export function taskList(status?: string): { id: string; goal: string; status: TaskStatus; slices: number; updated: number }[] {
  try {
    const all = Object.values(loadAll());
    const f = status ? all.filter((t) => t.status === status) : all;
    return f.sort((a, b) => b.updated - a.updated)
      .map((t) => ({ id: t.id, goal: t.goal, status: t.status, slices: t.checkpoint.slices, updated: t.updated }));
  } catch {
    return [];
  }
}

/** Dettaglio (con checkpoint). Throw se assente. */
export function taskStatus(id: string): LTask {
  const t = loadAll()[String(id)];
  if (!t) throw new Error(`task non trovato: ${id}`);
  return t;
}

/** Annulla (solo se non terminale). */
export function taskCancel(id: string): LTask {
  const all = loadAll();
  const t = all[String(id)];
  if (!t) throw new Error(`task non trovato: ${id}`);
  if (t.status === "done" || t.status === "fail" || t.status === "cancelled") {
    throw new Error(`task già terminale (${t.status}): ${id}`);
  }
  t.status = "cancelled";
  t.updated = Date.now();
  saveAll(all);
  return t;
}

/** Chiude con verdetto (dal coordinatore che ha revisionato il checkpoint). */
export function taskFinish(id: string, ok: boolean, summary = ""): LTask {
  const all = loadAll();
  const t = all[String(id)];
  if (!t) throw new Error(`task non trovato: ${id}`);
  if (t.status === "done" || t.status === "fail" || t.status === "cancelled") {
    throw new Error(`task già terminale (${t.status}): ${id}`);
  }
  t.status = ok ? "done" : "fail";
  if (summary.trim()) t.checkpoint.summary = `${t.checkpoint.summary}\nFinale: ${summary.trim()}`.trim().slice(0, 2000);
  t.updated = Date.now();
  saveAll(all);
  return t;
}

/**
 * Esegue UNA slice bounded e checkpointa (mai done da solo: serve finish).
 * Resume = altra slice con contesto checkpoint. Mai throw: fallimenti in {ok}.
 */
export async function taskSlice(
  id: string,
  opts: { workspace?: string; budgetSteps?: number } = {},
): Promise<{ ok: boolean; via: string; slice?: number; summary?: string; error?: string }> {
  const all = loadAll();
  const t = all[String(id)];
  if (!t) return { ok: false, via: VIA, error: `task non trovato: ${id}` };
  if (t.status === "done" || t.status === "fail" || t.status === "cancelled") {
    return { ok: false, via: VIA, error: `task terminale (${t.status}): ${id}` };
  }
  if (t.runAt && Date.now() < t.runAt) {
    return { ok: false, via: VIA, error: `task non ancora dovuto (runAt ${new Date(t.runAt).toISOString()})` };
  }
  t.status = "running";
  t.attempts++;
  saveAll(all);
  try {
    const goal = t.checkpoint.slices === 0
      ? t.goal
      : `${t.goal}\nContesto checkpoint (slice ${t.checkpoint.slices}): ${t.checkpoint.summary.slice(0, 800)}\nContinua da qui senza rifare il fatto.`;
    const r = await runTask(goal, { workspace: opts.workspace, budgetSteps: opts.budgetSteps ?? 8 });
    t.checkpoint.slices++;
    t.checkpoint.summary = `${t.checkpoint.summary}\n[slice ${t.checkpoint.slices}] ${r.summary}`.trim().slice(-2000);
    for (const f of r.filesTouched ?? []) {
      if (!t.checkpoint.files.includes(f)) t.checkpoint.files.push(f);
    }
    t.updated = Date.now();
    saveAll(all);
    return { ok: r.ok, via: VIA, slice: t.checkpoint.slices, summary: r.summary.slice(0, 500) };
  } catch (e) {
    return { ok: false, via: VIA, error: `slice fallita: ${String(e).slice(0, 200)}` };
  }
}

export const tasks = {
  file: tasksFile, schedule: taskSchedule, list: taskList, status: taskStatus,
  cancel: taskCancel, finish: taskFinish, slice: taskSlice,
};
