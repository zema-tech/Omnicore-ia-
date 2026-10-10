// TUI Omnicore — pannelli ANSI nativi (chat | tool | stato), niente blessed/ink.
// Uso: npm run tui [--dir <path>]. Senza TTY (pipe) degrada a chat semplice.
// I turni passano dall'UNICO loop; sessioni in data/sessions.json.
import { emitKeypressEvents, createInterface } from "node:readline";
import { runAgent } from "./agent/index.ts";
import { TOOL_CATALOG } from "./agent/tools.ts";
import { llmDoctor } from "./mind/llm.ts";
import { budget } from "./modules/budget.ts";
import { parseSlash, SLASH_HELP } from "./modules/chat.ts";
import { frame, applyEvent, pushUser, TUI_HELP, type TuiPanels } from "./modules/tui.ts";
import { logMessage, listSessions, readMessages } from "./modules/sessions.ts";

const ALT_ON = "\x1b[?1049h\x1b[H";
const ALT_OFF = "\x1b[?1049l";
const HIDE = "\x1b[?25l";
const SHOW = "\x1b[?25h";

async function statusLines(sid: string | null, directory?: string): Promise<string[]> {
  let brain = "?";
  try {
    brain = (await llmDoctor()).active;
  } catch { /* best-effort */ }
  let bud = "budget --";
  try {
    const b = budget.status();
    bud = b.pct == null ? `token oggi ${b.usedTokens}` : `token ${b.usedTokens}/${b.budgetTokens}${b.alert80 ? " ALERT" : ""}${b.over ? " OVER" : ""}`;
  } catch { /* best-effort */ }
  return [`brain ${brain} · ${bud}`, `sessione ${sid ?? "-"} · dir ${directory ?? "(default)"}`, TUI_HELP];
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const dirIdx = raw.indexOf("--dir");
  let directory = dirIdx >= 0 ? raw[dirIdx + 1] : undefined;
  const tty = !!process.stdin.isTTY && !!process.stdout.isTTY;
  if (!tty) {
    await plainFallback(directory);
    return;
  }

  let panels: TuiPanels = { status: [], chat: ["Omnicore TUI — /help per i comandi."], tools: [] };
  let sid: string | null = null;
  let input = "";
  let history: string[] = [];
  let histIdx = -1;
  let busy = false;
  let abortTurn = false;

  const W = () => process.stdout.columns || 80;
  const H = () => process.stdout.rows || 24;

  function draw(): void {
    process.stdout.write(ALT_ON + HIDE + frame(panels, W(), H()) + `\n> ${input}`);
  }

  async function refreshStatus(): Promise<void> {
    panels.status = await statusLines(sid, directory);
  }

  async function submit(): Promise<void> {
    const text = input.trim();
    input = "";
    histIdx = -1;
    if (!text) {
      draw();
      return;
    }
    const slash = parseSlash(text);
    if (slash) {
      await handleSlash(slash.cmd, slash.args);
      draw();
      return;
    }
    history.push(text);
    panels = pushUser(panels, text);
    busy = true;
    abortTurn = false;
    draw();
    const res = await runAgent(text, {
      directory,
      shouldAbort: () => abortTurn,
      onEvent: (e) => {
        panels = applyEvent(panels, e);
        draw();
      },
    });
    busy = false;
    panels = pushUser(panels, res.reply.slice(0, 500));
    try {
      sid = logMessage(sid, { text, intent: res.intent, handler: "agent", ok: true, answer: res.reply.slice(0, 2000) });
    } catch { /* log best-effort */ }
    await refreshStatus();
    draw();
  }

  async function say(line: string): Promise<void> {
    panels = pushUser(panels, line);
  }

  async function handleSlash(cmd: string, args: string): Promise<void> {
    switch (cmd) {
      case "help":
        await say(SLASH_HELP);
        break;
      case "doctor": {
        const d = await llmDoctor();
        await say(`attivo: ${d.active} (api:${d.api.ok ? "ok" : "ko"} local:${d.local.ok ? "ok" : "ko"})`);
        break;
      }
      case "model": {
        const d = await llmDoctor();
        const b = budget.status();
        await say(`brain ${d.active} · token oggi ${b.usedTokens}${b.budgetTokens ? `/${b.budgetTokens}` : ""}`);
        break;
      }
      case "tools":
        await say(TOOL_CATALOG.map((t) => t.name).join(", "));
        break;
      case "dir":
        directory = args || undefined;
        await say(`workspace: ${directory ?? "(default)"}`);
        break;
      case "rounds": {
        const n = Math.max(1, Math.min(Number(args) || 4, 10));
        process.env["OMNICORE_MAX_ROUNDS"] = String(n);
        await say(`giri ReAct: ${n}`);
        break;
      }
      case "new":
        sid = null;
        await say("nuova sessione al prossimo messaggio");
        break;
      case "sessions": {
        const list = listSessions().slice(-8);
        await say(list.length ? list.map((s) => `${s.id} (${s.count}): ${s.last}`).join("\n") : "(nessuna)");
        break;
      }
      case "resume": {
        const msgs = readMessages(args, 5);
        await say(msgs.length ? msgs.map((m) => `· ${String(m.text ?? "").slice(0, 120)}`).join("\n") : "sessione non trovata");
        break;
      }
      case "quit":
      case "exit":
        quit();
        break;
      default:
        await say(`comando ignoto: /${cmd}`);
    }
    await refreshStatus();
  }

  function quit(): void {
    process.stdout.write(SHOW + ALT_OFF);
    try {
      (process.stdin as any).setRawMode?.(false);
    } catch { /* terminale già chiuso */ }
    process.exit(0);
  }

  emitKeypressEvents(process.stdin);
  try {
    (process.stdin as any).setRawMode?.(true);
  } catch { /* no TTY reale */ }
  process.stdin.resume();
  process.stdin.on("keypress", (str: string, key: any = {}) => {
    void (async () => {
      if (key.ctrl && key.name === "c") {
        if (busy) {
          abortTurn = true;
          panels = pushUser(panels, "(interrompo dopo il tool corrente…)");
          draw();
        } else quit();
        return;
      }
      if (key.ctrl && key.name === "d") {
        quit();
        return;
      }
      if (busy) return;
      if (key.name === "return" || key.name === "enter") {
        process.stdout.write("\n");
        await submit();
        return;
      }
      if (key.name === "backspace") {
        input = input.slice(0, -1);
        draw();
        return;
      }
      if (key.name === "up") {
        if (history.length) {
          histIdx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
          input = history[histIdx] ?? "";
          draw();
        }
        return;
      }
      if (key.name === "down") {
        if (histIdx >= 0) {
          histIdx++;
          input = histIdx >= history.length ? "" : (history[histIdx] ?? "");
          if (histIdx >= history.length) histIdx = -1;
          draw();
        }
        return;
      }
      if (str && str.length === 1 && !key.ctrl && !key.meta) {
        input += str;
        draw();
      }
    })();
  });

  await refreshStatus();
  draw();
}

/** Fallback senza TTY: chat riga per riga (testabile via pipe). */
async function plainFallback(directory?: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "omnicore> " });
  console.log("Omnicore (no TTY: modo semplice) — /tools, /help, /quit.");
  const alive = () => !(rl as any).closed;
  rl.on("line", (line) => {
    void (async () => {
      const text = line.trim();
      if (!text) {
        if (alive()) rl.prompt();
        return;
      }
      const slash = parseSlash(text);
      if (slash && (slash.cmd === "quit" || slash.cmd === "exit")) {
        rl.close();
        return;
      }
      if (slash && slash.cmd === "tools") {
        console.log(TOOL_CATALOG.map((t) => t.name).join(", "));
        if (alive()) rl.prompt();
        return;
      }
      if (slash && slash.cmd === "help") {
        console.log(SLASH_HELP);
        if (alive()) rl.prompt();
        return;
      }
      const res = await runAgent(text, { directory });
      console.log(res.reply);
      if (alive()) rl.prompt();
    })().catch(() => {
      try {
        rl.close();
      } catch { /* chiusura */ }
    });
  });
  rl.prompt();
  await new Promise<void>((res) => rl.on("close", () => res()));
}

await main();
