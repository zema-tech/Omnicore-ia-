// Omnicore pipeline — la FUSIONE vera: memoria -> codice -> presenza -> mente.
// Ogni facoltà fonde vendor + nativo; la mente sintetizza la risposta unica.
// Ogni step registra {step, via, ok, result|error}: nessun throw esce da fuse().
import { route } from "./router.ts";
import { memory } from "./faculties/memory.ts";
import { code } from "./faculties/code.ts";
import { channel } from "./faculties/channel.ts";
import { synthesize } from "./mind/synth.ts";
import type { OmnicoreRequest } from "./types.ts";

export interface FuseStep {
  step: "brain" | "hands" | "face";
  via: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface FuseResult {
  intent: string;
  handler: string;
  text: string;
  steps: FuseStep[];
  answer: string;
  mind: { via: string; model: string };
  identity: "omnicore";
}

function err(e: unknown): string {
  return String(e).slice(0, 300);
}

/** Esegue la fusione completa. Non lancia mai eccezioni. */
export async function fuse(req: OmnicoreRequest): Promise<FuseResult> {
  const { intent, handler } = route(req);
  const steps: FuseStep[] = [];

  // 1) MEMORIA fusa (nativa + Hermes + sessioni, best-effort dentro la facoltà)
  try {
    const brain = await memory.search(req.text, 5);
    steps.push({ step: "brain", via: brain.via, ok: true, result: brain.hits });
  } catch (e) {
    steps.push({ step: "brain", via: "memory(facoltà)", ok: false, error: err(e) });
  }

  // 2) CODICE fuso (serve → CLI dentro la facoltà), solo se intent=code
  if (intent === "code") {
    const hands = await code.run(req.text, { directory: req.directory });
    steps.push(hands.ok
      ? { step: "hands", via: hands.via, ok: true, result: hands.output.slice(0, 2000) }
      : { step: "hands", via: hands.via, ok: false, error: hands.output.slice(0, 300) });
  } else {
    steps.push({ step: "hands", via: "code [skip: intent!=code]", ok: true, result: "skipped" });
  }

  // 3) PRESENZA fusa (gateway best-effort, MAI fatale)
  try {
    const face = await channel.status();
    steps.push({ step: "face", via: "channel(native status)", ok: true, result: face });
  } catch (e) {
    steps.push({ step: "face", via: "channel(native)", ok: false, error: err(e) });
  }

  // 4) MIND — sintesi a vera IA (LLM se configurato, altrimenti euristica offline)
  let mind = { answer: `Sono Omnicore: ho recepito “${req.text}”.`, via: "fallback", model: "none" };
  try {
    mind = await synthesize(req.text, intent, steps);
  } catch { /* mai fatale */ }

  return { intent, handler, text: req.text, steps, answer: mind.answer, mind: { via: mind.via, model: mind.model }, identity: "omnicore" as const };
}
