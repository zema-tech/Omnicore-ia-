// Tool surface unificata Omnicore.
// L'agente vede solo questi nomi. Dietro ci sono le FACOLTÀ (capacità fuse),
// non i vendor: gli adapter restano nascosti dentro src/faculties/.
import { memory } from "../faculties/memory.ts";
import { code } from "../faculties/code.ts";
import { channel } from "../faculties/channel.ts";
import { decideRank, decideVerify } from "../decide/index.ts";

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

/** Esegue un tool Omnicore mappandolo alla facoltà interna. */
export async function runTool(call: ToolCall, ctx: { directory?: string; text?: string } = {}): Promise<ToolResult> {
  const args = call.args ?? {};

  try {
    switch (call.name) {
      case "memory.search": {
        const q = String(args.query ?? args.search ?? ctx.text ?? "");
        const limit = Number(args.limit ?? 5);
        const { hits, via } = await memory.search(q, limit);
        return { name: call.name, ok: true, via, data: hits };
      }
      case "memory.read": {
        const key = String(args.session_key ?? args.key ?? "");
        const limit = Number(args.limit ?? 50);
        const data = await memory.read(key, limit);
        return { name: call.name, ok: true, via: "memory(hermes-read)", data };
      }
      case "code.run": {
        const prompt = String(args.prompt ?? ctx.text ?? "");
        const directory = (args.directory as string | undefined) ?? ctx.directory;
        const r = await code.run(prompt, { directory });
        return r.ok
          ? { name: call.name, ok: true, via: r.via, data: r.output }
          : { name: call.name, ok: false, via: r.via, error: r.output };
      }
      case "channel.status": {
        const data = await channel.status();
        return { name: call.name, ok: true, via: "channel(openclaw)", data };
      }
      case "channel.announce": {
        const message = String(args.message ?? ctx.text ?? "");
        const targets = Array.isArray(args.targets) ? (args.targets as string[]) : [];
        const r = await channel.announce(message, targets);
        return r.ok
          ? { name: call.name, ok: true, via: "channel(openclaw)", data: r.detail }
          : { name: call.name, ok: false, via: "channel(openclaw)", error: String((r.detail as any)?.hint ?? r.detail) };
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
      case "decide.rank": {
        const raw = args.candidates ?? args.candidati ?? [];
        const list = (Array.isArray(raw) ? raw : []).map((c) =>
          typeof c === "string" ? { name: c, desc: c } : { name: String((c as any).name ?? ""), desc: String((c as any).desc ?? (c as any).name ?? "") },
        ).filter((c) => c.name);
        if (!list.length) {
          return { name: call.name, ok: false, via: "decide", error: "decide.rank vuole candidates: [{name, desc}]" };
        }
        const r = await decideRank(String(args.state ?? ctx.text ?? ""), list);
        return { name: call.name, ok: true, via: `decide(${r.level})`, data: r.ranking };
      }
      case "decide.verify": {
        const action = (args.azione ?? args.action ?? {}) as { name?: unknown; args?: unknown };
        if (typeof action.name !== "string" || !action.name) {
          return { name: call.name, ok: false, via: "decide", error: "decide.verify vuole action: {name, args}" };
        }
        const r = await decideVerify(
          { name: action.name as ToolCall["name"], args: (action.args ?? {}) as Record<string, unknown> },
          { state: String(args.state ?? ctx.text ?? ""), confirm: args.confirm === true },
        );
        return { name: call.name, ok: r.verdict.verdict === "allow", via: `decide(${r.level})`, data: r.verdict };
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
