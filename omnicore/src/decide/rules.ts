// Decide livello 1 — regole locali. Sempre disponibili, zero rete, zero GPU.
// Coprono: errori di dipendenza (tool/motore noto offline), loop di tentativi
// identici, task banali (nessuna azione distruttiva necessaria).
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

/** Firma di un tentativo per il rilevamento loop: tool + args ordinati. */
export function attemptKey(call: ToolCall): string {
  const args = call.args ?? {};
  const sorted = Object.keys(args).sort().map((k) => `${k}=${JSON.stringify(args[k])}`).join("&");
  return `${call.name}?${sorted}`;
}

const DESTRUCTIVE = new Set(["code.run", "channel.announce", "world.exec"]);

/** Verifica locale di un'azione. Mai throw. */
export function verifyLocal(
  call: ToolCall,
  ctx: { confirm?: boolean; recentAttempts?: string[]; backendDown?: string[] } = {},
): VerifyResult {
  // Sconosciuto o distruttivo senza conferma esplicita
  if (DESTRUCTIVE.has(call.name) && ctx.confirm !== true) {
    return { verdict: "review", reason: `${call.name} scrive o esegue: serve conferma esplicita (Tappa 6)` };
  }
  // Loop di tentativi identici: stesso tool+args già provato e fallito
  const key = attemptKey(call);
  const repeats = (ctx.recentAttempts ?? []).filter((a) => a === key).length;
  if (repeats >= 1) {
    return { verdict: "deny", reason: `tentativo identico già eseguito (${repeats}x): ${key} — loop evitato` };
  }
  // Dipendenza nota offline (il chiamante segnala motori giù)
  if ((ctx.backendDown ?? []).some((b) => call.name.startsWith(b))) {
    return { verdict: "deny", reason: `motore per ${call.name} segnalato offline` };
  }
  return { verdict: "allow", reason: "regole locali: ok" };
}

/** Ordinamento locale dei candidati: banali prima, doppioni e ignoti dopo. Mai throw. */
export function rankLocal(candidates: string[]): RankedCandidate[] {
  const seen = new Set<string>();
  const out: RankedCandidate[] = [];
  for (const name of candidates) {
    if (seen.has(name)) {
      out.push({ name, score: -1, reason: "doppione" });
      continue;
    }
    seen.add(name);
    if (name === "respond" || name === "memory.search") {
      out.push({ name, score: 10, reason: "banale/sicuro" });
    } else if (name === "memory.read" || name === "channel.status") {
      out.push({ name, score: 5, reason: "sola lettura" });
    } else if (DESTRUCTIVE.has(name)) {
      out.push({ name, score: 1, reason: "distruttivo: per ultimo" });
    } else {
      out.push({ name, score: 0, reason: "sconosciuto" });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export const DESTRUCTIVE_TOOLS = [...DESTRUCTIVE];
