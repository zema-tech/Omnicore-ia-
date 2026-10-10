// Modulo AGENTI — registro nativo degli agenti di Omnicore
// (modellato su OpenClaw agents.* + gateway agents: CRUD in data/agents.json).
// Un agente = {name, skills, status}. Fanout: task paralleli con routing per
// ruolo (code/research/ops) o per agente registrato, sessioni figlie con
// parent, coordinatore che aggrega. Zero dipendenze (solo moduli nativi).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runTask } from "./code_agent.ts";
import { websearch } from "./websearch.ts";
import { web } from "./web.ts";
import { logMessage } from "./sessions.ts";

export interface AgentDef {
  name: string;
  skills: string[];
  status: "active" | "paused";
  created: number;
}

const HERE = dirname(fileURLToPath(import.meta.url));

export function agentsFile(): string {
  return process.env["OMNICORE_AGENTS_FILE"] ?? join(HERE, "..", "..", "data", "agents.json");
}

function load(): AgentDef[] {
  try {
    const d = JSON.parse(readFileSync(agentsFile(), "utf8"));
    return Array.isArray(d?.agents) ? d.agents : [];
  } catch {
    return [];
  }
}

function save(agents: AgentDef[]): void {
  const f = agentsFile();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ agents }, null, 2));
}

/** Registra (o aggiorna) un agente. Throw se nome invalido. */
export function agentRegister(name: string, skills: string[] = []): AgentDef {
  if (!/^[a-z0-9][a-z0-9\-_]{0,40}$/i.test(name)) throw new Error(`nome agente invalido: ${name}`);
  const agents = load().filter((a) => a.name !== name);
  const def: AgentDef = { name, skills: skills.map(String).slice(0, 20), status: "active", created: Date.now() };
  agents.push(def);
  save(agents);
  return def;
}

export function agentList(): AgentDef[] {
  return load();
}

export function agentPause(name: string): boolean {
  const agents = load();
  const a = agents.find((x) => x.name === name);
  if (!a) return false;
  a.status = "paused";
  save(agents);
  return true;
}

export const agents = { register: agentRegister, list: agentList, pause: agentPause, fanout: agentFanout };

export type FanoutRole = "code" | "research" | "ops";
export interface FanoutItem { agent?: string; role?: FanoutRole; task: string }
export interface FanoutResultItem { agent: string; role: FanoutRole; ok: boolean; summary: string; session: string }
export interface FanoutReport { run: string; ok: boolean; results: FanoutResultItem[]; summary: string }

/** Routing per ruolo quando non c'è un agente registrato. */
function roleOf(item: FanoutItem): FanoutRole {
  if (item.role === "research" || item.role === "ops" || item.role === "code") return item.role;
  return "code";
}

async function runRole(
  role: FanoutRole,
  task: string,
  opts: { workspace?: string; budgetSteps?: number },
): Promise<{ ok: boolean; summary: string }> {
  if (role === "research") {
    const s = await websearch.search(task, { maxResults: 5 });
    if (!s.ok) return { ok: false, summary: `ricerca fallita: ${s.error}` };
    const tops = s.results.slice(0, 2);
    const parts: string[] = [];
    for (const h of tops) {
      const p = await web.fetch(h.url);
      parts.push(`- ${h.title} (${h.url}): ${(p.ok && p.page ? p.page.text : h.snippet).slice(0, 500)}`);
    }
    return { ok: true, summary: `ricerca "${task.slice(0, 60)}": ${s.results.length} fonti\n${parts.join("\n")}`.slice(0, 2000) };
  }
  if (role === "ops") {
    return { ok: true, summary: `ops "${task.slice(0, 80)}": nessun effetto collaterale dal fanout (usa channel/cron dedicati)` };
  }
  const r = await runTask(task, { workspace: opts.workspace, budgetSteps: opts.budgetSteps ?? 8 });
  return { ok: r.ok, summary: r.summary.slice(0, 1000) };
}

/**
 * Esegue task indipendenti in parallelo e aggrega. Ogni item dichiara
 * {agent+task} (secondario registrato) o {role+task} (code/research/ops).
 * Ogni esecuzione logga una sessione figlia con parent=run. Mai throw.
 */
export async function agentFanout(
  items: FanoutItem[],
  opts: { workspace?: string; budgetSteps?: number; parent?: string } = {},
): Promise<FanoutReport> {
  const run = opts.parent ?? `fanout-${Date.now()}`;
  const list = items.slice(0, 5);
  const execOne = async (item: FanoutItem): Promise<FanoutResultItem> => {
    const who = String(item.agent ?? "").trim();
    const role = roleOf(item);
    const task = String(item.task ?? "").trim();
    const label = who || `role:${role}`;
    const fail = (summary: string): FanoutResultItem => {
      let session = "";
      try {
        session = logMessage(null, { text: task, parent: run, agent: label, role: "subagent", ok: false, answer: summary });
      } catch { /* log best-effort */ }
      return { agent: label, role, ok: false, summary, session };
    };
    if (!task) return fail("task vuoto");
    try {
      if (who) {
        const def = agentList().find((a) => a.name === who);
        if (!def) return fail(`agente non registrato: ${who}`);
        if (def.status !== "active") return fail(`agente in pausa: ${who}`);
        const skillsCtx = def.skills.length ? ` (skill: ${def.skills.join(", ")})` : "";
        const r = await runTask(`${task}${skillsCtx}`, { workspace: opts.workspace, budgetSteps: opts.budgetSteps ?? 8 });
        const summary = `${r.summary} [file: ${(r.filesTouched ?? []).join(", ") || "nessuno"}]`.slice(0, 1000);
        let session = "";
        try {
          session = logMessage(null, { text: task, parent: run, agent: who, role: "subagent", ok: r.ok, answer: summary });
        } catch { /* log best-effort */ }
        return { agent: who, role, ok: r.ok, summary, session };
      }
      const r = await runRole(role, task, opts);
      let session = "";
      try {
        session = logMessage(null, { text: task, parent: run, agent: label, role: "subagent", ok: r.ok, answer: r.summary });
      } catch { /* log best-effort */ }
      return { agent: label, role, ok: r.ok, summary: r.summary, session };
    } catch (e) {
      return fail(`eccezione: ${String(e).slice(0, 160)}`);
    }
  };
  const settled = await Promise.all(list.map((item) => execOne(item)));
  const okCount = settled.filter((r) => r.ok).length;
  return {
    run,
    ok: settled.length > 0 && settled.every((r) => r.ok),
    results: settled,
    summary: `fanout ${run}: ${okCount}/${settled.length} ok — ${settled.map((r) => `${r.agent}:${r.ok ? "ok" : "ko"}`).join(", ")}`,
  };
}
