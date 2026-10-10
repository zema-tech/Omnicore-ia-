// Prompt-cache — prefisso byte-stabile per il riuso provider-side.
// Regola (da Hermes "prompt-cache sacro"): PERSONA + istruzioni fisse non
// cambiano mai tra turni, così OpenAI/Anthropic riusano il prefisso in cache
// (meno latenza e costo). Solo il blocco utente/contesto varia in coda.
// Zero dipendenze (node:crypto built-in per l'hash di verifica).
import { createHash } from "node:crypto";
import { PERSONA } from "./synth.ts";

/** Prefisso stabile: identità + regole di risposta, mai contenuto turno. */
export function stablePrefix(): string {
  return `${PERSONA}\nRegole: rispondi nella lingua dell'utente; max 3 tool per piano; mai dump JSON.`;
}

/** Hash del prefisso: i test provano che resta stabile tra turni. */
export function prefixHash(): string {
  return createHash("sha256").update(stablePrefix(), "utf8").digest("hex").slice(0, 16);
}

export const pcache = { prefix: stablePrefix, hash: prefixHash };
