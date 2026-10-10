// Modulo CHAT — logica pura della console interattiva (stile TUI testuale
// di Hermes/OpenCode/OpenClaw, ma senza dipendenze: solo readline).
// parseSlash: "/cmd args" -> {cmd, args} | null. formatEvent: riga stampabile.
// Il runner vive in src/chat.ts. Zero dipendenze.
import type { LoopEvent } from "../agent/loop.ts";

export interface Slash { cmd: string; args: string }

/** "/comando resto" -> {cmd, args}; testo normale -> null. */
export function parseSlash(line: string): Slash | null {
  const t = line.trim();
  if (!t.startsWith("/")) return null;
  const sp = t.indexOf(" ");
  if (sp < 0) return { cmd: t.slice(1).toLowerCase(), args: "" };
  return { cmd: t.slice(1, sp).toLowerCase(), args: t.slice(sp + 1).trim() };
}

export const SLASH_HELP = [
  "/help — questo aiuto",
  "/doctor — quale cervello risponde (api/local/euristica)",
  "/tools — nomi dei tool disponibili",
  "/stream on|off — token live on/off (default on)",
  "/dir <path> — workspace dei tool file/shell",
  "/rounds <n> — budget giri ReAct (1-10)",
  "/new — nuova sessione",
  "/sessions — elenca sessioni",
  "/resume <id> — rileggi ultimi messaggi di una sessione",
  "/quit — esci (anche Ctrl+C a riposo, Ctrl+D)",
  "Ctrl+C durante un turno — interrompe dopo il tool corrente",
].join("\n");

/** Una riga stampabile per evento live (token grezzo, resto con prefisso). */
export function formatEvent(e: LoopEvent): string {
  switch (e.event) {
    case "token":
      return e.text;
    case "tool_start":
      return `\n… ${e.name} …`;
    case "tool_end":
      return `\n… ${e.name} ${e.ok ? "ok" : "KO"}`;
    case "loop_end":
      return `\n[giri ${e.rounds}, ${e.planner}]`;
  }
}

export const chat = { parseSlash, formatEvent, help: SLASH_HELP };
