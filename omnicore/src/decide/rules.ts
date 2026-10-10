// Decide livello 1 — regole locali. Sempre disponibili, zero rete, zero GPU.
import type { ToolCall } from "../agent/tools.ts";

export type Verdict = "allow" | "deny" | "review";

export interface VerifyResult {
  verdict: Verdict;
  reason: string;
}

export interface RankedCandidate {
  name: string;
  score: number;
  reason: string;
}

export function attemptKey(call: ToolCall): string {
  const args = call.args ?? {};
  const sorted = Object.keys(args).sort().map((k) => `${k}=${JSON.stringify(args[k])}`).join("&");
  return `${call.name}?${sorted}`;
}

const DESTRUCTIVE = new Set([
  "code.run",
  "code.task",
  "code.write",
  "code.shell",
  "code.edit",
  "channel.announce",
  "skills.create",
  "agents.run",
  "world.exec",
]);

export function verifyLocal(
  call: ToolCall,
  ctx: { confirm?: boolean; recentAttempts?: string[]; backendDown?: string[] } = {},
): VerifyResult {
  if (DESTRUCTIVE.has(call.name) && ctx.confirm !== true) {
    return { verdict: "review", reason: `${call.name} scrive o esegue: serve conferma esplicita (Tappa 6)` };
  }
  const key = attemptKey(call);
  const repeats = (ctx.recentAttempts ?? []).filter((a) => a === key).length;
  if (repeats >= 1) {
    return { verdict: "deny", reason: `tentativo identico già eseguito (${repeats}x): ${key} — loop evitato` };
  }
  if ((ctx.backendDown ?? []).some((b) => call.name.startsWith(b))) {
    return { verdict: "deny", reason: `motore per ${call.name} segnalato offline` };
  }
  return { verdict: "allow", reason: "regole locali: ok" };
}

export function rankLocal(candidates: string[]): RankedCandidate[] {
  const seen = new Set<string>();
  const out: RankedCandidate[] = [];
  for (const name of candidates) {
    if (seen.has(name)) {
      out.push({ name, score: -1, reason: "doppione" });
      continue;
    }
    seen.add(name);
    if (name === "respond" || name === "memory.search" || name === "memory.note_search") {
      out.push({ name, score: 10, reason: "banale/sicuro" });
    } else if (
      name === "memory.read" ||
      name === "channel.status" ||
      name === "telegram.me" ||
      name === "telegram.poll" ||
      name === "memory.note_save" ||
      name === "code.read" ||
      name === "cron.list" ||
      name === "agents.list" ||
      name === "permissions.list" ||
      name === "skills.list" ||
      name === "skills.search" ||
      name === "skills.get" ||
      name === "code.glob" ||
      name === "code.grep" ||
      name === "web.fetch" ||
      name.startsWith("todo.")
    ) {
      out.push({ name, score: 5, reason: "sola lettura o scrittura propria" });
    } else if (DESTRUCTIVE.has(name)) {
      out.push({ name, score: 1, reason: "distruttivo: per ultimo" });
    } else {
      out.push({ name, score: 0, reason: "sconosciuto" });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export const DESTRUCTIVE_TOOLS = [...DESTRUCTIVE];
