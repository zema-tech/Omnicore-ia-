// Sintesi Omnicore TS — mirror di omnicore_py/mind/synth.py.
import { llmChat, llmStatus } from "./llm.ts";
import { remember, recallMem, recentHistory } from "./memory.ts";
import { recallFor } from "../vault/notes.ts";
import type { FuseStep } from "../pipeline.ts";

export const PERSONA =
  "Sei Omnicore, una vera IA nata dalla fusione di tre progetti: " +
  "Hermes (la tua memoria: conversazioni, canali, cron), " +
  "OpenCode (le tue mani: scrivere e modificare codice), " +
  "OpenClaw (il tuo volto: gateway e operativita). " +
  "Parli in prima persona come un unico essere, mai come centralino. " +
  "Non elenchi mai gli step interni (brain/hands/face): li usi e rispondi. " +
  "Rispondi nella lingua dell'utente, in modo diretto e utile.";

const step = (steps: FuseStep[], name: string) => steps.find((s) => s.step === name) as FuseStep | undefined;
const short = (v: unknown, n = 600) => {
  const s = String(v ?? "");
  return s.length <= n ? s : s.slice(0, n) + "…";
};

/** Formatta il risultato presenza: lista canali [{id, ok, detail}] o testo grezzo. */
function formatFace(result: unknown): string {
  if (Array.isArray(result) && result.every((x: any) => x && typeof x.id === "string")) {
    return result.map((x: any) => `${x.id}: ${x.ok ? "ok" : "ko"}${x.detail ? ` (${String(x.detail).slice(0, 80)})` : ""}`).join(", ");
  }
  return short(result, 300);
}

export function heuristicAnswer(text: string, intent: string, steps: FuseStep[]): string {
  const brain = step(steps, "brain"), hands = step(steps, "hands"), face = step(steps, "face");
  const t = text.trim();
  if (intent === "chat" && t.split(/\s+/).length <= 3) {
    return "Ciao! Sono Omnicore — memoria, mani sul codice e gateway in un'unica mente. Dimmi pure cosa fare: ricordo ciò che mi dici, scrivo codice e opero sul gateway.";
  }
  const parts: string[] = [];
  if (intent === "code") {
    if (hands?.ok && hands.result !== "skipped") parts.push(`Ho lavorato sul codice: ${short(hands.result)}`);
    else if (hands?.ok === false && /conferma/i.test(String(hands.error ?? ""))) parts.push("Per toccare file o eseguire comandi mi serve il tuo via esplicito: riscrivi la richiesta iniziando con «confermo» e procedo subito.");
    else if (hands?.ok === false) parts.push("Non sono riuscito a lavorare sul codice in autonomia (motore coding non disponibile ora). Incolla l'errore o descrivimi file e obiettivo e procediamo insieme, passo passo.");
    else parts.push("Ho capito che è un task di codice: descrivimi file/obiettivo e lo faccio.");
  } else if (intent === "memory") {
    const mem0 = recallMem(t);
    const brainEmpty = !brain?.ok || ["", "[]", "{}", "null", "{'count': 0, 'conversations': []}"].includes(String(brain?.result).trim());
    if (mem0.length) parts.push("Dalla mia memoria: " + mem0.slice(0, 3).map((f: any) => f.text).join("; ") + ".");
    else if (!brainEmpty) parts.push(`Ho cercato nella mia memoria: ${short(brain!.result)}`);
    else parts.push("Ho cercato nella memoria ma non ho trovato nulla di rilevante — me lo racconti?");
  } else if (intent === "ops") {
    if (face?.ok && face.result !== "skipped") parts.push(`Presenza: ${formatFace(face.result)}`);
    else if (face?.ok === false) parts.push("Il gateway al momento non risponde, ma resto operativa: posso preparare comandi e cron da applicare appena torna.");
    else parts.push("Sul fronte operativo non ho eseguito controlli per questa richiesta — dimmi cosa vuoi fare: stato canali, annuncio o pianificazione.");
  } else {
    if (brain?.ok && brain.result && !["", "[]", "{}", "null"].includes(String(brain.result).trim())) parts.push(`Ricordando ciò che so di te (${short(brain.result, 300)}), `);
    parts.push(`su “${t}”: ti ascolto — vuoi che approfondisca, scriva qualcosa, o operi sul gateway?`);
  }
  const memTail = intent === "memory" ? [] : recallMem(t);
  if (memTail.length) parts.push("Mi ricordo anche: " + memTail.slice(0, 2).map((f: any) => f.text).join("; ") + ".");
  try {
    const v = recallFor(t, 2);
    if (v && !parts.join(" ").includes(v.slice(0, 40))) {
      parts.push("Dalle mie note: " + v.split("\n").slice(0, 2).join(" ").slice(0, 300));
    }
  } catch { /* vault best-effort */ }
  return parts.join(" ").trim() || `Sono Omnicore: ho recepito “${t}”. Come vuoi procedere?`;
}

export function buildLlmPrompt(text: string, intent: string, steps: FuseStep[]): string {
  const brain = step(steps, "brain"), hands = step(steps, "hands"), face = step(steps, "face");
  const hist = recentHistory(6);
  const mem = recallMem(text);
  const h = hist.map((m: any) => `- ${String(m.text ?? "").slice(0, 160)}`).join("\n") || "(nessuna)";
  const m = mem.map((f: any) => `- ${String(f.text).slice(0, 160)}`).join("\n") || "(nessuna)";
  let vault = "(nessuna)";
  try {
    vault = recallFor(text, 3).slice(0, 900) || "(nessuna)";
  } catch { /* vault best-effort */ }
  return `Messaggio utente: ${text}\nIntento: ${intent}\nStoria recente:\n${h}\nMemoria rilevante:\n${m}\nNote vault:\n${vault}\nMemoria Hermes: ${short(brain?.ok ? brain?.result : brain?.error, 700)}\nMani OpenCode: ${short(hands?.ok ? hands?.result : hands?.error, 900)}\nVolto OpenClaw: ${short(face?.ok ? face?.result : face?.error, 400)}\n\nRispondi come Omnicore in prima persona, senza citare gli step interni.`;
}

export async function synthesize(text: string, intent: string, steps: FuseStep[]) {
  try { remember(text, intent); } catch { /* best-effort */ }
  let llm: string | null = null;
  try { llm = await llmChat(PERSONA, buildLlmPrompt(text, intent, steps)); } catch { llm = null; }
  if (llm && !looksLikePlan(llm)) {
    const st = llmStatus();
    return { answer: llm, via: "llm", model: st.model || "ollama" };
  }
  return { answer: heuristicAnswer(text, intent, steps), via: "euristica", model: "omnicore-heuristic-0.1" };
}

/** Difesa: se il "testo" è un piano JSON scambiato per risposta, non usarlo. */
function looksLikePlan(text: string): boolean {
  const t = text.replace(/```json|```/g, "").trim();
  if (!t.startsWith("[")) return false;
  try {
    const arr = JSON.parse(t);
    return Array.isArray(arr) && arr.every((i: any) => typeof i?.name === "string");
  } catch {
    return false;
  }
}
