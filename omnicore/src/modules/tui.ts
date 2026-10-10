// Modulo TUI — vista a pannelli ANSI senza dipendenze (stile blessed/ink
// nei layout, ma solo stringhe: chat | tool | stato). Funzioni pure e
// testabili; il runner interattivo vive in src/tui.ts. Zero dipendenze.
import type { LoopEvent } from "../agent/loop.ts";

export interface TuiPanels {
  status: string[];
  chat: string[];
  tools: string[];
}

export const TUI_HELP = "↑↓ storia · Enter invia · Ctrl+C interrompe turno / esce · /help comandi";

/** Riquadro ASCII: titolo + righe tagliate/paddate a width. Puro. */
export function box(title: string, lines: string[], width: number, height: number): string[] {
  const w = Math.max(10, width);
  const inner = w - 2;
  const cut = (s: string) => (s.length > inner ? s.slice(0, inner) : s + " ".repeat(inner - s.length));
  const top = "+" + (title ? ` ${title} `.slice(0, inner).padEnd(inner, "-") : "-".repeat(inner)) + "+";
  const out = [top];
  const body = lines.slice(-Math.max(0, height - 2));
  for (const l of body) out.push(`|${cut(l)}|`);
  while (out.length < height - 1) out.push(`|${" ".repeat(inner)}|`);
  out.push("+" + "-".repeat(inner) + "+");
  return out.slice(0, height);
}

/** Dimensioni pannelli: status 4 righe, sotto chat 60% + tool 40%. Puro. */
export function layout(width: number, height: number): { statusH: number; chatW: number; toolW: number; bodyH: number } {
  const w = Math.max(40, width);
  const h = Math.max(12, height);
  const statusH = 4;
  const bodyH = h - statusH;
  const chatW = Math.floor((w * 3) / 5);
  return { statusH, chatW, toolW: w - chatW, bodyH };
}

/** Schermo intero: status sopra, chat+tool affiancati. Puro. */
export function frame(p: TuiPanels, width: number, height: number): string {
  const l = layout(width, height);
  // "@@..." = riga token in corso: si mostra senza marcatore
  const chat = p.chat.map((x) => (x.startsWith("@@") ? x.slice(2) : x));
  const left = box("chat", chat, l.chatW, l.bodyH);
  const right = box("tool", p.tools, l.toolW, l.bodyH);
  const rows: string[] = [];
  for (let i = 0; i < l.bodyH; i++) rows.push((left[i] ?? "") + (right[i] ?? ""));
  return [...box("omnicore", p.status, width, l.statusH), ...rows].join("\n");
}

/** Applica un evento live ai pannelli (chat cap 200, tool cap 60). Puro. */
export function applyEvent(p: TuiPanels, e: LoopEvent): TuiPanels {
  const chat = [...p.chat];
  const tools = [...p.tools];
  if (e.event === "token") {
    chat.push(`@@${e.text}`);
  } else if (e.event === "tool_start") {
    tools.push(`… ${e.name} …`);
  } else if (e.event === "tool_end") {
    tools.push(`… ${e.name} ${e.ok ? "ok" : "KO"}`);
  } else if (e.event === "loop_end") {
    tools.push(`[giri ${e.rounds}, ${e.planner}]`);
  }
  // compatta token consecutivi in una riga
  const compact: string[] = [];
  for (const line of chat) {
    if (line.startsWith("@@") && compact.length && compact[compact.length - 1].startsWith("@@")) {
      compact[compact.length - 1] += line.slice(2);
    } else {
      compact.push(line);
    }
  }
  // "@@" resta come marcatore interno (lo toglie frame al render)
  return { status: p.status, chat: compact.slice(-200), tools: tools.slice(-60) };
}

/** Riga utente nel pannello chat. Puro. */
export function pushUser(p: TuiPanels, text: string): TuiPanels {
  return { ...p, chat: [...p.chat, `> ${text}`.slice(0, 300)].slice(-200) };
}

export const tui = { box, layout, frame, applyEvent, pushUser, help: TUI_HELP };
