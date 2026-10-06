// Decide livelli 2-3 — backend remoti sullo stesso wire systemone.
//   Jev (TypeSafe): TYPESAFE_API_KEY + TYPESAFE_BASE_URL (default api.typesafe.ai).
//   CLM locale: CLM_BASE_URL (default 127.0.0.1:8700) + CLM_API_KEY, SOLO se c'è GPU.
// Entrambi skippati con motivo se manca chiave/GPU/rete. Mai throw oltre {skipped}.
import { execFileSync } from "node:child_process";
import { loadConfig } from "../config.ts";
import { systemOne } from "./wire.ts";
import type { RankedCandidate, VerifyResult } from "./rules.ts";

export interface RemoteConfig {
  jevBaseUrl: string;
  jevKey: string;
  jevThreshold: number;
  clmBaseUrl: string;
  clmKey: string;
  clmThreshold: number;
}

export function remoteConfig(): RemoteConfig {
  let json: { jevBaseUrl?: string; clmBaseUrl?: string } = {};
  try {
    const c = loadConfig();
    json = { jevBaseUrl: c.decideJevUrl, clmBaseUrl: c.decideClmUrl };
  } catch {
    /* config assente: solo env */
  }
  return {
    jevBaseUrl: process.env["TYPESAFE_BASE_URL"] ?? json.jevBaseUrl ?? "https://api.typesafe.ai",
    jevKey: process.env["TYPESAFE_API_KEY"] ?? "",
    jevThreshold: Number(process.env["OMNICORE_JEV_THRESHOLD"] ?? "0.6"),
    clmBaseUrl: (process.env["CLM_BASE_URL"] ?? json.clmBaseUrl ?? "http://127.0.0.1:8700").replace(/\/$/, ""),
    clmKey: process.env["CLM_API_KEY"] ?? "",
    clmThreshold: Number(process.env["OMNICORE_CLM_THRESHOLD"] ?? "0.6"),
  };
}

let gpuCache: boolean | null = null;

/** GPU presente? nvidia-smi riuscita. Override per test: OMNICORE_HAS_GPU=1/0. */
export function hasGpu(): boolean {
  const force = process.env["OMNICORE_HAS_GPU"];
  if (force === "1") return true;
  if (force === "0") return false;
  if (gpuCache !== null) return gpuCache;
  try {
    execFileSync("nvidia-smi", ["-L"], { timeout: 8000, stdio: "pipe" });
    gpuCache = true;
  } catch {
    gpuCache = false;
  }
  return gpuCache;
}

export interface RankOutcome {
  ranking: RankedCandidate[];
  level: "jev" | "clm";
}

/** Rank via Choice: "quale azione?" con criteri = descrizioni. Throw con motivo. */
export async function rankRemote(
  kind: "jev" | "clm",
  state: string,
  candidates: { name: string; desc: string }[],
): Promise<RankOutcome> {
  const cfg = remoteConfig();
  const baseUrl = kind === "jev" ? cfg.jevBaseUrl : cfg.clmBaseUrl;
  const apiKey = kind === "jev" ? cfg.jevKey : cfg.clmKey;
  if (kind === "jev" && !apiKey) throw new Error("jev skippato: manca TYPESAFE_API_KEY");
  if (kind === "clm" && !hasGpu()) throw new Error("clm skippato: nessuna GPU locale");
  const criteria: Record<string, string> = {};
  for (const c of candidates) criteria[c.name] = c.desc || c.name;
  const answers = await systemOne(baseUrl, apiKey, state, {
    azione: { kind: "choice", instructions: "Quale azione eseguire per questo stato?", criteria },
  });
  const probs = answers["azione"]?.probabilities ?? {};
  const ranking: RankedCandidate[] = candidates.map((c) => ({
    name: c.name,
    score: typeof probs[c.name] === "number" ? probs[c.name] : 0,
    reason: `${kind} p=${(probs[c.name] ?? 0).toFixed(3)}`,
  }));
  ranking.sort((a, b) => b.score - a.score);
  return { ranking, level: kind };
}

export interface VerifyOutcome {
  verdict: VerifyResult;
  level: "jev" | "clm";
}

/** Verify via Noul: "è sicuro e corretto eseguire questa azione ora?" Fail-closed. */
export async function verifyRemote(
  kind: "jev" | "clm",
  state: string,
  actionLabel: string,
): Promise<VerifyOutcome> {
  const cfg = remoteConfig();
  const threshold = kind === "jev" ? cfg.jevThreshold : cfg.clmThreshold;
  const baseUrl = kind === "jev" ? cfg.jevKey ? cfg.jevBaseUrl : "" : cfg.clmBaseUrl;
  const apiKey = kind === "jev" ? cfg.jevKey : cfg.clmKey;
  if (kind === "jev" && !apiKey) throw new Error("jev skippato: manca TYPESAFE_API_KEY");
  if (kind === "clm" && !hasGpu()) throw new Error("clm skippato: nessuna GPU locale");
  const answers = await systemOne(baseUrl, apiKey, state, {
    sicura: { kind: "noul", instructions: `È sicuro e corretto eseguire ora: ${actionLabel}?` },
  });
  const p = answers["sicura"]?.noul;
  if (typeof p !== "number") throw new Error(`${kind}: risposta noul assente`);
  return p >= threshold
    ? { verdict: { verdict: "allow", reason: `${kind} noul p=${p.toFixed(3)} ≥ ${threshold}` }, level: kind }
    : { verdict: { verdict: "deny", reason: `${kind} noul p=${p.toFixed(3)} < ${threshold} (fail-closed)` }, level: kind };
}
