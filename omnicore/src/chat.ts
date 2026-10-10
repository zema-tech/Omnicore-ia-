// Chat interattiva Omnicore — console ReAct con streaming e slash command.
// Uso: npm run chat [--dir <path>]. Zero dipendenze (node:readline).
// I turni passano dall'UNICO loop (runAgent); le sessioni in data/sessions.json.
import { createInterface } from "node:readline";
import { runAgent } from "./agent/index.ts";
import { TOOL_CATALOG } from "./agent/tools.ts";
import { llmDoctor } from "./mind/llm.ts";
import { parseSlash, formatEvent, SLASH_HELP } from "./modules/chat.ts";
import { logMessage, listSessions, readMessages } from "./modules/sessions.ts";

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const dirIdx = raw.indexOf("--dir");
  let directory = dirIdx >= 0 ? raw[dirIdx + 1] : undefined;
  let stream = true;
  let sid: string | null = null;

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "omnicore> " });
  console.log("Omnicore — scrivi, /help per i comandi, /quit per uscire. Ctrl+C interrompe il turno.");
  let busy = false;
  let abortTurn = false;
  rl.on("SIGINT", () => {
    if (busy) {
      abortTurn = true;
      process.stdout.write("\n(interrompo dopo il tool corrente…)\n");
    } else {
      rl.close();
    }
  });

  const ask = (): void => rl.prompt();
  rl.on("line", (line) => {
    void handle(line).then(ask, ask);
  });
  rl.on("close", () => {
    console.log("\nCiao.");
    process.exit(0);
  });

  async function handle(line: string): Promise<void> {
    const text = line.trim();
    if (!text) return;
    const slash = parseSlash(text);
    if (slash) {
      await handleSlash(slash.cmd, slash.args);
      return;
    }
    busy = true;
    abortTurn = false;
    const res = await runAgent(text, {
      directory,
      shouldAbort: () => abortTurn,
      onEvent: (e) => {
        if (e.event === "token" && !stream) return;
        process.stdout.write(formatEvent(e));
      },
    });
    busy = false;
    if (stream) process.stdout.write("\n");
    sid = logMessage(sid, { text, intent: res.intent, handler: "agent", ok: true, answer: res.reply.slice(0, 2000) });
  }

  async function handleSlash(cmd: string, args: string): Promise<void> {
    switch (cmd) {
      case "help":
        console.log(SLASH_HELP);
        break;
      case "doctor": {
        const d = await llmDoctor();
        console.log(`attivo: ${d.active} (provider ${d.provider}) | api:${d.api.ok ? `ok ${d.api.ms}ms` : "ko"} local:${d.local.ok ? "ok" : "ko"}`);
        break;
      }
      case "tools":
        console.log(TOOL_CATALOG.map((t) => t.name).join(", "));
        break;
      case "stream":
        stream = args.toLowerCase() !== "off";
        console.log(`streaming ${stream ? "on" : "off"}`);
        break;
      case "dir":
        directory = args || undefined;
        console.log(`workspace: ${directory ?? "(default)"}`);
        break;
      case "rounds": {
        const n = Math.max(1, Math.min(Number(args) || 4, 10));
        process.env["OMNICORE_MAX_ROUNDS"] = String(n);
        console.log(`giri ReAct: ${n}`);
        break;
      }
      case "new":
        sid = null;
        console.log("nuova sessione al prossimo messaggio");
        break;
      case "sessions": {
        const list = listSessions().slice(-10);
        console.log(list.length ? list.map((s) => `${s.id} (${s.count} msg): ${s.last}`).join("\n") : "(nessuna sessione)");
        break;
      }
      case "resume": {
        const msgs = readMessages(args, 5);
        console.log(msgs.length ? msgs.map((m) => `· ${String(m.text ?? "").slice(0, 120)}`).join("\n") : "sessione non trovata");
        break;
      }
      case "quit":
      case "exit":
        rl.close();
        break;
      default:
        console.log(`comando ignoto: /${cmd} — /help per la lista`);
    }
  }

  ask();
}

await main();
