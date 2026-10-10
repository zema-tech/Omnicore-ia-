// Tool surface unificata Omnicore.
// L'agente vede solo questi nomi. Dietro ci sono le FACOLTÀ (capacità fuse),
// non i vendor: gli adapter restano nascosti dentro src/faculties/.
import { memory } from "../faculties/memory.ts";
import { code } from "../faculties/code.ts";
import { readFile, writeFile, runShell } from "../faculties/native_fs.ts";
import { edit } from "../modules/edit.ts";
import { search } from "../modules/search.ts";
import { web } from "../modules/web.ts";
import { todos } from "../modules/todo.ts";
import { channels } from "../modules/channels.ts";
import { telegram } from "../modules/telegram.ts";
import { mcp } from "../modules/mcp.ts";
import { cron } from "../modules/cron.ts";
import { agents } from "../modules/agents.ts";
import { permissions } from "../modules/permissions.ts";
import { skills } from "../modules/skills.ts";
import { codeAgent } from "../modules/code_agent.ts";
import { saveNote, searchNotes } from "../vault/notes.ts";
import { decideRank, decideVerify } from "../decide/index.ts";
import { moduleGates } from "../config.ts";

export type ToolName =
  | "memory.search"
  | "memory.read"
  | "memory.note_save"
  | "memory.note_search"
  | "code.run"
  | "code.task"
  | "code.read"
  | "code.write"
  | "code.shell"
  | "code.edit"
  | "code.glob"
  | "code.grep"
  | "web.fetch"
  | "todo.add"
  | "todo.list"
  | "todo.done"
  | "todo.clear"
  | "channel.status"
  | "channel.announce"
  | "telegram.me"
  | "telegram.poll"
  | "mcp.list"
  | "mcp.call"
  | "mcp.reload"
  | "cron.add"
  | "cron.list"
  | "cron.remove"
  | "agents.register"
  | "agents.list"
  | "agents.pause"
  | "agents.run"
  | "permissions.request"
  | "permissions.respond"
  | "permissions.list"
  | "skills.list"
  | "skills.get"
  | "skills.search"
  | "skills.create"
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
  /** Azione distruttiva proposta ma non eseguita: serve conferma esplicita. */
  needsConfirm?: boolean;
  preview?: string;
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
        try {
          const data = await memory.read(key, limit);
          return { name: call.name, ok: true, via: "memory(read)", data };
        } catch (e) {
          return { name: call.name, ok: false, via: "memory(read)", error: String(e).slice(0, 300) };
        }
      }
      case "memory.note_save": {
        try {
          const file = saveNote(String(args.title ?? "Nota"), String(args.body ?? args.text ?? ""));
          return { name: call.name, ok: true, via: "memory(vault)", data: { file } };
        } catch (e) {
          return { name: call.name, ok: false, via: "memory(vault)", error: String(e).slice(0, 200) };
        }
      }
      case "memory.note_search": {
        const hits = searchNotes(String(args.query ?? ctx.text ?? ""), Number(args.limit ?? 5));
        return { name: call.name, ok: true, via: "memory(vault)", data: hits };
      }
      case "code.run": {
        const prompt = String(args.prompt ?? ctx.text ?? "");
        const directory = (args.directory as string | undefined) ?? ctx.directory;
        if (args.confirm !== true) {
          return { name: call.name, ok: false, via: "code", needsConfirm: true, preview: prompt.slice(0, 300) };
        }
        const r = await code.run(prompt, { directory });
        return r.ok
          ? { name: call.name, ok: true, via: r.via, data: r.output }
          : { name: call.name, ok: false, via: r.via, error: r.output };
      }
      case "code.task": {
        // Claude Code di Omnicore: multi-step nativo (plan→list/read/write/shell).
        const goal = String(args.goal ?? args.prompt ?? ctx.text ?? "");
        if (args.confirm !== true) {
          return {
            name: call.name,
            ok: false,
            via: "code(agent-native)",
            needsConfirm: true,
            preview: `code.task: ${goal.slice(0, 280)}`,
          };
        }
        const r = await codeAgent.runTask(goal, {
          workspace: (args.workspace as string | undefined) ?? ctx.directory,
          budgetSteps: Number(args.budgetSteps ?? 8),
        });
        const timeline = codeAgent.formatTimeline(r);
        return r.ok
          ? {
              name: call.name,
              ok: true,
              via: r.via,
              data: {
                summary: r.summary,
                timeline,
                steps: r.steps,
                filesTouched: r.filesTouched,
              },
            }
          : {
              name: call.name,
              ok: false,
              via: r.via,
              error: timeline || r.summary,
              data: { steps: r.steps, filesTouched: r.filesTouched },
            };
      }
      case "code.read": {
        const r = readFile(String(args.path ?? ""));
        return r.ok
          ? { name: call.name, ok: true, via: r.via, data: r.output }
          : { name: call.name, ok: false, via: r.via, error: r.output };
      }
      case "code.write": {
        if (args.confirm !== true) {
          return { name: call.name, ok: false, via: "code", needsConfirm: true, preview: `${args.path ?? ""} (${String(args.content ?? "").length} char)` };
        }
        const r = writeFile(String(args.path ?? ""), String(args.content ?? ""));
        return r.ok
          ? { name: call.name, ok: true, via: r.via, data: r.output }
          : { name: call.name, ok: false, via: r.via, error: r.output };
      }
      case "code.shell": {
        if (args.confirm !== true) {
          return { name: call.name, ok: false, via: "code", needsConfirm: true, preview: String(args.cmd ?? "").slice(0, 300) };
        }
        const r = await runShell(String(args.cmd ?? ""), { cwd: (args.cwd as string | undefined) ?? ctx.directory });
        return r.ok
          ? { name: call.name, ok: true, via: r.via, data: r.output }
          : { name: call.name, ok: false, via: r.via, error: r.output };
      }
      case "code.edit": {
        const path = String(args.path ?? "");
        const oldText = String(args.oldText ?? "");
        const newText = String(args.newText ?? "");
        if (args.apply === true) {
          if (args.confirm !== true) {
            return { name: call.name, ok: false, via: "code", needsConfirm: true, preview: `edit ${path}` };
          }
          const r = edit.apply(path, oldText, newText, { all: args.all === true });
          return r.ok
            ? { name: call.name, ok: true, via: r.via, data: r.output }
            : { name: call.name, ok: false, via: r.via, error: r.output };
        }
        const p = edit.preview(path, oldText, newText);
        return p.ok
          ? { name: call.name, ok: true, via: p.via, data: p.diff }
          : { name: call.name, ok: false, via: p.via, error: p.diff };
      }
      case "code.glob": {
        const r = search.glob(String(args.pattern ?? ""));
        return r.ok
          ? { name: call.name, ok: true, via: r.via, data: r.output }
          : { name: call.name, ok: false, via: r.via, error: r.error ?? "glob fallito" };
      }
      case "code.grep": {
        const r = search.grep(String(args.pattern ?? ""), String(args.dir ?? "."));
        return r.ok
          ? { name: call.name, ok: true, via: r.via, data: r.hits }
          : { name: call.name, ok: false, via: r.via, error: r.error ?? "grep fallito" };
      }
      case "web.fetch": {
        const url = String(args.url ?? ctx.text?.match(/https?:\/\/[^\s"'“”<>]+/)?.[0] ?? "");
        if (!url) {
          return { name: call.name, ok: false, via: "web(native-fetch)", error: "web.fetch vuole {url: https://…}" };
        }
        const r = await web.fetch(url);
        return r.ok
          ? { name: call.name, ok: true, via: r.via, data: r.page }
          : { name: call.name, ok: false, via: r.via, error: r.error ?? "fetch fallito" };
      }
      case "todo.add": {
        try {
          return { name: call.name, ok: true, via: "todo", data: todos.add(String(args.text ?? "")) };
        } catch (e) {
          return { name: call.name, ok: false, via: "todo", error: String(e).slice(0, 200) };
        }
      }
      case "todo.list": {
        return { name: call.name, ok: true, via: "todo", data: todos.list() };
      }
      case "todo.done": {
        const done = todos.set(String(args.id ?? ""), "done");
        return done
          ? { name: call.name, ok: true, via: "todo", data: { done: args.id } }
          : { name: call.name, ok: false, via: "todo", error: `todo non trovato: ${args.id}` };
      }
      case "todo.clear": {
        return { name: call.name, ok: true, via: "todo", data: { cleared: todos.clear() } };
      }
      case "channel.status": {
        return { name: call.name, ok: true, via: "channel(native)", data: channels.status() };
      }
      case "channel.announce": {
        const message = String(args.message ?? ctx.text ?? "");
        const targets = Array.isArray(args.targets) ? (args.targets as string[]) : [];
        if (args.confirm !== true) {
          return { name: call.name, ok: false, via: "channel", needsConfirm: true, preview: (targets.length ? `[to:${targets.join(",")}] ` : "") + message.slice(0, 300) };
        }
        const r = await channels.send(message, targets);
        return r.ok
          ? { name: call.name, ok: true, via: r.via, data: r.detail }
          : { name: call.name, ok: false, via: r.via, error: r.detail };
      }
      case "telegram.me": {
        const r = await telegram.me();
        return r.ok
          ? { name: call.name, ok: true, via: r.via, data: r.data }
          : { name: call.name, ok: false, via: r.via, error: r.error ?? "telegram non verificato" };
      }
      case "telegram.poll": {
        const r = await telegram.poll({
          offset: typeof args.offset === "number" ? args.offset : undefined,
          timeoutSec: typeof args.timeout === "number" ? args.timeout : undefined,
        });
        return r.ok
          ? { name: call.name, ok: true, via: r.via, data: r.data }
          : { name: call.name, ok: false, via: r.via, error: r.error ?? "poll fallito" };
      }
      case "mcp.list": {
        if (args.confirm !== true) {
          return { name: call.name, ok: false, via: "mcp", needsConfirm: true, preview: "mcp.list: avvia i server configurati" };
        }
        const r = await mcp.list();
        return { name: call.name, ok: true, via: r.via, data: r.servers };
      }
      case "mcp.call": {
        const server = String(args.server ?? "");
        const tool = String(args.tool ?? "");
        if (args.confirm !== true) {
          return { name: call.name, ok: false, via: "mcp", needsConfirm: true, preview: `mcp.call ${server}.${tool}` };
        }
        if (!server || !tool) {
          return { name: call.name, ok: false, via: "mcp", error: "mcp.call vuole {server, tool, args}" };
        }
        const r = await mcp.call(server, tool, (args.args ?? {}) as Record<string, unknown>);
        return r.ok
          ? { name: call.name, ok: true, via: r.via, data: r.data }
          : { name: call.name, ok: false, via: r.via, error: r.error ?? "mcp.call fallita" };
      }
      case "mcp.reload": {
        if (args.confirm !== true) {
          return { name: call.name, ok: false, via: "mcp", needsConfirm: true, preview: "mcp.reload: ferma tutti i server" };
        }
        return { name: call.name, ok: true, via: "mcp", data: mcp.stop() };
      }
      case "cron.add": {
        try {
          const job = cron.add(String(args.name ?? ""), (args.schedule ?? {}) as never, (args.payload ?? {}) as Record<string, unknown>);
          return { name: call.name, ok: true, via: "cron", data: job };
        } catch (e) {
          return { name: call.name, ok: false, via: "cron", error: String(e).slice(0, 200) };
        }
      }
      case "cron.list": {
        return { name: call.name, ok: true, via: "cron", data: cron.list() };
      }
      case "cron.remove": {
        const done = cron.remove(String(args.name ?? ""));
        return done
          ? { name: call.name, ok: true, via: "cron", data: { removed: args.name } }
          : { name: call.name, ok: false, via: "cron", error: `job non trovato: ${args.name}` };
      }
      case "agents.register": {
        try {
          const def = agents.register(String(args.name ?? ""), Array.isArray(args.skills) ? args.skills.map(String) : []);
          return { name: call.name, ok: true, via: "agents", data: def };
        } catch (e) {
          return { name: call.name, ok: false, via: "agents", error: String(e).slice(0, 200) };
        }
      }
      case "agents.list": {
        return { name: call.name, ok: true, via: "agents", data: agents.list() };
      }
      case "agents.pause": {
        const done = agents.pause(String(args.name ?? ""));
        return done
          ? { name: call.name, ok: true, via: "agents", data: { paused: args.name } }
          : { name: call.name, ok: false, via: "agents", error: `agente non trovato: ${args.name}` };
      }
      case "agents.run": {
        // Secondario: stesse mani del principale (code.task isolato), resa come
        // riassunto taggato stile OpenCode <task_result>. Delega confermata una
        // volta qui; dentro gira con conferma forzata (niente doppie richieste).
        const name = String(args.name ?? "");
        const task = String(args.task ?? args.goal ?? "");
        if (args.confirm !== true) {
          return { name: call.name, ok: false, via: "agents", needsConfirm: true, preview: `agents.run ${name}: ${task.slice(0, 250)}` };
        }
        if (!task.trim()) {
          return { name: call.name, ok: false, via: "agents", error: "agents.run vuole {name, task}" };
        }
        const def = agents.list().find((a) => a.name === name);
        if (!def) {
          return { name: call.name, ok: false, via: "agents", error: `agente non registrato: ${name} (agents.register prima)` };
        }
        if (def.status !== "active") {
          return { name: call.name, ok: false, via: "agents", error: `agente in pausa: ${name}` };
        }
        const skillsCtx = def.skills.length ? ` (skill: ${def.skills.join(", ")})` : "";
        const r = await codeAgent.runTask(`${task}${skillsCtx}`, {
          workspace: (args.workspace as string | undefined) ?? ctx.directory,
          budgetSteps: Number(args.budgetSteps ?? 8),
        });
        const report = `<task_result agent="${def.name}" ok="${r.ok}">\n${codeAgent.formatTimeline(r)}\n</task_result>`;
        return r.ok
          ? { name: call.name, ok: true, via: `agents(${r.via})`, data: { agent: def.name, summary: r.summary, filesTouched: r.filesTouched, report } }
          : { name: call.name, ok: false, via: `agents(${r.via})`, error: report.slice(0, 600) };
      }
      case "permissions.request": {
        try {
          const req = permissions.request(String(args.action ?? ""), String(args.target ?? ""), String(args.reason ?? ""));
          return { name: call.name, ok: true, via: "permissions", data: req };
        } catch (e) {
          return { name: call.name, ok: false, via: "permissions", error: String(e).slice(0, 200) };
        }
      }
      case "permissions.respond": {
        const done = permissions.respond(String(args.id ?? ""), args.allow === true);
        return done
          ? { name: call.name, ok: true, via: "permissions", data: { id: args.id, allow: args.allow === true } }
          : { name: call.name, ok: false, via: "permissions", error: `richiesta non trovata o già decisa: ${args.id}` };
      }
      case "permissions.list": {
        return { name: call.name, ok: true, via: "permissions", data: permissions.open() };
      }
      case "skills.list": {
        return { name: call.name, ok: true, via: "skills", data: skills.list().map((s) => ({ name: s.name, description: s.description })) };
      }
      case "skills.get": {
        const s = skills.get(String(args.name ?? ""));
        return s
          ? { name: call.name, ok: true, via: "skills", data: s }
          : { name: call.name, ok: false, via: "skills", error: `skill non trovata: ${args.name}` };
      }
      case "skills.search": {
        return { name: call.name, ok: true, via: "skills", data: skills.search(String(args.query ?? "")).map((s) => ({ name: s.name, description: s.description })) };
      }
      case "skills.create": {
        // Scrive nel repo: serve conferma esplicita come code.write.
        if (args.confirm !== true) {
          return { name: call.name, ok: false, via: "skills", needsConfirm: true, preview: `skill ${args.name ?? ""}: ${String(args.description ?? "").slice(0, 200)}` };
        }
        try {
          const created = skills.create(String(args.name ?? ""), String(args.description ?? ""), String(args.instructions ?? args.body ?? ""));
          return { name: call.name, ok: true, via: "skills", data: created };
        } catch (e) {
          return { name: call.name, ok: false, via: "skills", error: String(e).slice(0, 200) };
        }
      }
      case "world.exec": {
        if (args.confirm !== true) {
          return { name: call.name, ok: false, via: "world", needsConfirm: true, preview: String(args.cmd ?? "").slice(0, 300) };
        }
        if (!moduleGates().world) {
          return {
            name: call.name,
            ok: false,
            via: "world",
            error: "profilo light: mondo disabilitato (serve medium o alt)",
          };
        }
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
        const r = await decideRank(String(args.state ?? ctx.text ?? ""), list, {
          allowClm: moduleGates().clm,
        });
        return { name: call.name, ok: true, via: `decide(${r.level})`, data: r.ranking };
      }
      case "decide.verify": {
        const action = (args.azione ?? args.action ?? {}) as { name?: unknown; args?: unknown };
        if (typeof action.name !== "string" || !action.name) {
          return { name: call.name, ok: false, via: "decide", error: "decide.verify vuole action: {name, args}" };
        }
        const r = await decideVerify(
          { name: action.name as ToolCall["name"], args: (action.args ?? {}) as Record<string, unknown> },
          { state: String(args.state ?? ctx.text ?? ""), confirm: args.confirm === true, allowClm: moduleGates().clm },
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
  { name: "memory.note_save", description: "Salva una nota nel vault (titolo + testo)" },
  { name: "memory.note_search", description: "Cerca nelle note del vault" },
  { name: "code.task", description: "Claude Code di Omnicore: agent multi-step {goal} (conferma)" },
  { name: "code.run", description: "Task coding alto livello (nativo se possibile, else OpenCode)" },
  { name: "code.read", description: "Leggi un file del workspace" },
  { name: "code.write", description: "Scrivi un file nel workspace (conferma)" },
  { name: "code.shell", description: "Comando shell nel workspace (conferma)" },
  { name: "code.edit", description: "Diff preview {path,oldText,newText}; apply:true scrive (conferma)" },
  { name: "code.glob", description: "File per pattern {pattern}" },
  { name: "code.grep", description: "Cerca regex nei file {pattern, dir}" },
  { name: "web.fetch", description: "Leggi una pagina pubblica {url} (solo testo, anti-SSRF)" },
  { name: "todo.add", description: "Aggiungi passo {text}" },
  { name: "todo.list", description: "Elenca i passi" },
  { name: "todo.done", description: "Chiudi un passo {id}" },
  { name: "todo.clear", description: "Pulisci i passi chiusi" },
  { name: "channel.status", description: "Stato canali nativi di presenza" },
  { name: "channel.announce", description: "Annuncio / invio su canali (conferma)" },
  { name: "telegram.me", description: "Verifica il bot Telegram configurato" },
  { name: "telegram.poll", description: "Leggi messaggi Telegram in arrivo {offset, timeout}" },
  { name: "mcp.list", description: "Server MCP + tool scoperti (conferma)" },
  { name: "mcp.call", description: "Chiama tool MCP {server, tool, args} (conferma)" },
  { name: "mcp.reload", description: "Ferma tutti i server MCP (conferma)" },
  { name: "cron.add", description: "Pianifica un job {name, schedule, payload}" },
  { name: "cron.list", description: "Elenca i job pianificati" },
  { name: "cron.remove", description: "Rimuovi un job {name}" },
  { name: "agents.register", description: "Registra un agente {name, skills}" },
  { name: "agents.list", description: "Elenca gli agenti registrati" },
  { name: "agents.pause", description: "Mette in pausa un agente {name}" },
  { name: "agents.run", description: "Secondario file-worker isolato {name, task} (conferma)" },
  { name: "permissions.request", description: "Chiede approvazione {action, target, reason}" },
  { name: "permissions.respond", description: "Approva/nega {id, allow}" },
  { name: "permissions.list", description: "Richieste di approvazione aperte" },
  { name: "skills.list", description: "Elenca le skill caricabili" },
  { name: "skills.get", description: "Leggi una skill {name}" },
  { name: "skills.search", description: "Cerca skill {query}" },
  { name: "skills.create", description: "Crea skill riusabile {name, description, instructions} (conferma)" },
  { name: "world.exec", description: "Comando nel mondo virtuale (Mirage)" },
  { name: "decide.rank", description: "Rank azioni candidate (CLM System One)" },
  { name: "decide.verify", description: "Verifica un'azione (CLM)" },
  { name: "respond", description: "Risposta finale all'utente" },
];
