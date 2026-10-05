// Tool surface unificata Omnicore.
// L'agente vede solo questi nomi. Gli adapter vendor restano nascosti.
import { hermes } from "../adapters/hermes.ts";
import { opencode } from "../adapters/opencode.ts";
import { openclaw } from "../adapters/openclaw.ts";
import { loadConfig } from "../config.ts";

export type ToolName =
  | "memory.search"
  | "memory.read"
  | "code.run"
  | "channel.status"
  | "channel.announce"
  | "world.exec"
  | "decide.rank"
  | "decide.verify"
  | "respond";

export interface ToolCall {
  name: ToolName;
  args?: Record<string, unknown>;
}

export interface ToolResult {
  name: ToolName;
  ok: boolean;
  via: string;
  data?: unknown;
  error?: string;
}

function err(e: unknown): string {
  return String(e).slice(0, 400);
}

/** Esegue un tool Omnicore mappandolo all'organo interno. */
export async function runTool(call: ToolCall, ctx: { directory?: string; text?: string } = {}): Promise<ToolResult> {
  const cfg = loadConfig();
  const args = call.args ?? {};

  try {
    switch (call.name) {
      case "memory.search": {
        const q = String(args.query ?? args.search ?? ctx.text ?? "");
        const limit = Number(args.limit ?? 5);
        const data = await hermes.recall(q, limit, {
          python: cfg.hermesPython,
          hermesDir: cfg.hermesDir,
        });
        return { name: call.name, ok: true, via: "memory(hermes)", data };
      }
      case "memory.read": {
        const key = String(args.session_key ?? args.key ?? "");
        const limit = Number(args.limit ?? 50);
        const data = await hermes.read(key, limit, {
          python: cfg.hermesPython,
          hermesDir: cfg.hermesDir,
        });
        return { name: call.name, ok: true, via: "memory(hermes)", data };
      }
      case "code.run": {
        const prompt = String(args.prompt ?? ctx.text ?? "");
        const directory = (args.directory as string | undefined) ?? ctx.directory;
        try {
          const data = await opencode.promptServer(
            prompt,
            { baseUrl: cfg.opencodeUrl, password: cfg.opencodePassword || undefined },
            { directory },
          );
          return { name: call.name, ok: true, via: "code(opencode-serve)", data };
        } catch (e1) {
          try {
            const cli = await opencode.promptCli(prompt, {}, { directory });
            return { name: call.name, ok: true, via: "code(opencode-cli)", data: cli.slice(0, 4000) };
          } catch (e2) {
            return {
              name: call.name,
              ok: false,
              via: "code(opencode)",
              error: `${err(e1)} | cli: ${err(e2)}`,
            };
          }
        }
      }
      case "channel.status": {
        const data = await openclaw.status({
          baseUrl: cfg.openclawUrl,
          token: cfg.openclawToken || undefined,
        });
        return { name: call.name, ok: true, via: "channel(openclaw)", data };
      }
      case "channel.announce": {
        const message = String(args.message ?? ctx.text ?? "");
        const targets = Array.isArray(args.targets) ? (args.targets as string[]) : [];
        const data = await openclaw.announce(
          { baseUrl: cfg.openclawUrl, token: cfg.openclawToken || undefined },
          targets.length ? `[to:${targets.join(",")}] ${message}` : message,
        );
        return { name: call.name, ok: true, via: "channel(openclaw)", data };
      }
      case "world.exec": {
        // Stub: Mirage non ancora collegato. Quando vendors/mirage è attivo, qui va Workspace.execute.
        return {
          name: call.name,
          ok: false,
          via: "world(mirage)",
          error: "motore world non configurato — aggiungi vendors/mirage e implementa l'adapter",
        };
      }
      case "decide.rank":
      case "decide.verify": {
        // Stub: CLM non ancora collegato. Quando clm-serve è up, qui va POST system-one.
        return {
          name: call.name,
          ok: false,
          via: "decide(clm)",
          error: "motore decide non configurato — richiede CLM (GPU) o fallback euristico nel loop",
        };
      }
      case "respond": {
        return {
          name: call.name,
          ok: true,
          via: "omnicore",
          data: { text: String(args.text ?? "") },
        };
      }
      default:
        return { name: call.name, ok: false, via: "omnicore", error: `tool sconosciuto: ${call.name}` };
    }
  } catch (e) {
    return { name: call.name, ok: false, via: "omnicore", error: err(e) };
  }
}

export const TOOL_CATALOG: { name: ToolName; description: string }[] = [
  { name: "memory.search", description: "Cerca nella memoria a lungo termine" },
  { name: "memory.read", description: "Leggi una sessione/memoria per chiave" },
  { name: "code.run", description: "Esegui un task di coding sul progetto" },
  { name: "channel.status", description: "Stato canali / gateway di presenza" },
  { name: "channel.announce", description: "Annuncio / invio su canali" },
  { name: "world.exec", description: "Comando nel mondo virtuale (Mirage)" },
  { name: "decide.rank", description: "Rank azioni candidate (CLM System One)" },
  { name: "decide.verify", description: "Verifica un'azione (CLM)" },
  { name: "respond", description: "Risposta finale all'utente" },
];
