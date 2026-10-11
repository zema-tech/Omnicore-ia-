// Modulo WORKBOARD — coordinamento multi-agente (stile OpenClaw workboard).
// Coda task persistente data/workboard.json: priorità, dipendenze, owner,
// handoff con contesto tra agenti, monitoraggio stato. Zero dipendenze.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIA = "board(native)";

export type BoardStatus = "queued" | "running" | "done" | "fail";
export interface BoardTask {
  id: string;
  title: string;
  status: BoardStatus;
  priority: number;
  owner: string;
  dependsOn: string[];
  payload: string;
  result: string;
  handoffs: { from: string; to: string; context: string; ts: number }[];
  created: number;
  updated: number;
}

export function boardFile(): string {
  return process.env["OMNICORE_BOARD_FILE"] ?? join(HERE, "..", "..", "data", "workboard.json");
}

function loadAll(): Record<string, BoardTask> {
  try {
    const d = JSON.parse(readFileSync(boardFile(), "utf8"));
    return d?.tasks && typeof d.tasks === "object" ? d.tasks : {};
  } catch {
    return {};
  }
}

function saveAll(t: Record<string, BoardTask>): void {
  const f = boardFile();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ tasks: t }, null, 2));
}

function depsMet(t: BoardTask, all: Record<string, BoardTask>): boolean {
  return t.dependsOn.every((d) => all[d]?.status === "done");
}

/** Aggiunge un task. Throw se titolo vuoto o dipendenze assurde. */
export function boardAdd(title: string, opts: { priority?: number; dependsOn?: string[]; payload?: string } = {}): BoardTask {
  const t = String(title ?? "").trim().slice(0, 200);
  if (!t) throw new Error("board.add vuole {title}");
  const all = loadAll();
  const deps = (opts.dependsOn ?? []).map(String).filter(Boolean).slice(0, 10);
  for (const d of deps) {
    if (!all[d]) throw new Error(`dipendenza assente: ${d}`);
  }
  const id = `task-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
  if (deps.includes(id)) throw new Error("dipendenza circolare su sé stesso");
  const task: BoardTask = {
    id, title: t, status: "queued",
    priority: Math.max(0, Math.min(Number(opts.priority ?? 5), 10)),
    owner: "", dependsOn: deps, payload: String(opts.payload ?? "").slice(0, 2000),
    result: "", handoffs: [], created: Date.now(), updated: Date.now(),
  };
  all[id] = task;
  saveAll(all);
  return task;
}

/** Elenco ordinato (priorità, poi creazione). Mai throw. */
export function boardList(status?: string): BoardTask[] {
  try {
    const all = Object.values(loadAll());
    const f = status ? all.filter((t) => t.status === status) : all;
    return f.sort((a, b) => b.priority - a.priority || a.created - b.created);
  } catch {
    return [];
  }
}

/** Prende il prossimo task pronto (dipendenze ok) e lo marca running. */
export function boardClaim(owner: string): BoardTask | null {
  if (!String(owner ?? "").trim()) throw new Error("board.claim vuole {owner}");
  const all = loadAll();
  const ready = Object.values(all)
    .filter((t) => t.status === "queued" && depsMet(t, all))
    .sort((a, b) => b.priority - a.priority || a.created - b.created);
  const t = ready[0];
  if (!t) return null;
  t.status = "running";
  t.owner = String(owner).slice(0, 60);
  t.updated = Date.now();
  saveAll(all);
  return t;
}

/** Chiude un task running (done/fail + risultato). */
export function boardDone(id: string, ok: boolean, result = ""): BoardTask {
  const all = loadAll();
  const t = all[String(id)];
  if (!t) throw new Error(`task non trovato: ${id}`);
  if (t.status !== "running") throw new Error(`task non running (${t.status}): ${id}`);
  t.status = ok ? "done" : "fail";
  t.result = String(result ?? "").slice(0, 2000);
  t.updated = Date.now();
  saveAll(all);
  return t;
}

/** Handoff: passa il controllo a un altro agente con contesto preservato. */
export function boardHandoff(id: string, from: string, to: string, context: string): BoardTask {
  const all = loadAll();
  const t = all[String(id)];
  if (!t) throw new Error(`task non trovato: ${id}`);
  if (!String(from ?? "").trim() || !String(to ?? "").trim()) throw new Error("handoff vuole {from, to}");
  if (String(from) === String(to)) throw new Error("handoff a sé stesso: niente da fare");
  t.handoffs.push({ from: String(from).slice(0, 60), to: String(to).slice(0, 60), context: String(context ?? "").slice(0, 1000), ts: Date.now() });
  t.owner = String(to).slice(0, 60);
  t.updated = Date.now();
  saveAll(all);
  return t;
}

/** Monitoraggio: conteggi + agenti attivi (owner dei running). Mai throw. */
export function boardStatus(): { counts: Record<BoardStatus, number>; active: { task: string; owner: string; title: string }[]; blocked: string[] } {
  try {
    const all = loadAll();
    const list = Object.values(all);
    const counts: Record<BoardStatus, number> = { queued: 0, running: 0, done: 0, fail: 0 };
    for (const t of list) counts[t.status]++;
    return {
      counts,
      active: list.filter((t) => t.status === "running").map((t) => ({ task: t.id, owner: t.owner, title: t.title })),
      blocked: list.filter((t) => t.status === "queued" && !depsMet(t, all)).map((t) => t.id),
    };
  } catch {
    return { counts: { queued: 0, running: 0, done: 0, fail: 0 }, active: [], blocked: [] };
  }
}

export const board = {
  file: boardFile, add: boardAdd, list: boardList, claim: boardClaim,
  done: boardDone, handoff: boardHandoff, status: boardStatus,
};
