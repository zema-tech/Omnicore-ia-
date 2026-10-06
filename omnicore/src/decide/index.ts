// Decide — cascata: regole locali → Jev via API → CLM locale (solo GPU).
// Se un livello manca (chiave/GPU/rete), degrada al successivo senza errori.
// Ultima spiaggia sempre le regole locali. Mai throw.
import { verifyLocal, rankLocal, type VerifyResult, type RankedCandidate } from "./rules.ts";
import { rankRemote, verifyRemote } from "./remote.ts";
import type { ToolCall } from "../agent/tools.ts";

export type DecideLevel = "rules" | "jev" | "clm";

export interface DecideRank {
  ranking: RankedCandidate[];
  level: DecideLevel;
}

export interface DecideVerify {
  verdict: VerifyResult;
  level: DecideLevel;
}

/** Rank a cascata su nomi tool. */
export async function decideRank(state: string, candidates: { name: string; desc: string }[]): Promise<DecideRank> {
  const names = candidates.map((c) => c.name);
  // Livello 2: Jev (serve chiave; errore -> si degrada)
  try {
    const r = await rankRemote("jev", state, candidates);
    if (r.ranking.length) return { ranking: r.ranking, level: "jev" };
  } catch {
    /* degrada */
  }
  // Livello 3: CLM (serve GPU; errore -> si degrada)
  try {
    const r = await rankRemote("clm", state, candidates);
    if (r.ranking.length) return { ranking: r.ranking, level: "clm" };
  } catch {
    /* degrada */
  }
  // Livello 1: regole locali (sempre)
  return { ranking: rankLocal(names), level: "rules" };
}

/** Verify a cascata su un'azione. Conferma esplicita vince (Tappa 6 la rende obbligatoria). */
export async function decideVerify(
  call: ToolCall,
  ctx: { state?: string; confirm?: boolean; recentAttempts?: string[]; backendDown?: string[] } = {},
): Promise<DecideVerify> {
  const state = ctx.state ?? `${call.name} ${JSON.stringify(call.args ?? {})}`.slice(0, 500);
  // Livello 2: Jev
  try {
    const r = await verifyRemote("jev", state, `${call.name}`);
    if (r.verdict.verdict === "deny") return { verdict: r.verdict, level: "jev" };
    // Jev permette -> le regole locali possono ancora bloccare (loop/conferma)
    const local = verifyLocal(call, ctx);
    return local.verdict === "allow" ? { verdict: r.verdict, level: "jev" } : { verdict: local, level: "rules" };
  } catch {
    /* degrada */
  }
  // Livello 3: CLM
  try {
    const r = await verifyRemote("clm", state, `${call.name}`);
    if (r.verdict.verdict === "deny") return { verdict: r.verdict, level: "clm" };
    const local = verifyLocal(call, ctx);
    return local.verdict === "allow" ? { verdict: r.verdict, level: "clm" } : { verdict: local, level: "rules" };
  } catch {
    /* degrada */
  }
  // Livello 1: regole locali (sempre)
  return { verdict: verifyLocal(call, ctx), level: "rules" };
}
