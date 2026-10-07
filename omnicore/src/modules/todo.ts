// Modulo TODO — piano di lavoro del coding agent (modellato su OpenCode
// todo.ts/todowrite: lista condivisa {id, text, status}, in data/todos.json).
// Zero dipendenze.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type TodoStatus = "open" | "doing" | "done";

export interface Todo {
  id: string;
  text: string;
  status: TodoStatus;
  created: number;
}

const HERE = dirname(fileURLToPath(import.meta.url));
let seq = 0;

export function todosFile(): string {
  return process.env["OMNICORE_TODOS_FILE"] ?? join(HERE, "..", "..", "data", "todos.json");
}

function load(): Todo[] {
  try {
    const d = JSON.parse(readFileSync(todosFile(), "utf8"));
    return Array.isArray(d?.todos) ? d.todos : [];
  } catch {
    return [];
  }
}

function save(todos: Todo[]): void {
  const f = todosFile();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ todos }, null, 2));
}

/** Aggiunge un passo. Throw se testo vuoto. */
export function todoAdd(text: string): Todo {
  if (!text.trim()) throw new Error("todo vuoto");
  const all = load();
  const t: Todo = { id: `td-${Date.now()}-${++seq}`, text: text.slice(0, 300), status: "open", created: Date.now() };
  all.push(t);
  save(all);
  return t;
}

export function todoList(): Todo[] {
  return load();
}

/** Cambia stato (doing/done). Ritorna false se id assente. */
export function todoSet(id: string, status: TodoStatus): boolean {
  const all = load();
  const t = all.find((x) => x.id === id);
  if (!t) return false;
  t.status = status;
  save(all);
  return true;
}

/** Pulisce i done. Ritorna quanti ne ha tolti. */
export function todoClear(): number {
  const all = load();
  const kept = all.filter((t) => t.status !== "done");
  save(kept);
  return all.length - kept.length;
}

export const todos = { add: todoAdd, list: todoList, set: todoSet, clear: todoClear };
