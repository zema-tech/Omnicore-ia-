// Modulo AGENTI — registro nativo degli agenti di Omnicore
// (modellato su OpenClaw agents.* + gateway agents: CRUD in data/agents.json).
// Un agente = {name, skills, status}. Zero dipendenze.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

export const agents = { register: agentRegister, list: agentList, pause: agentPause };
