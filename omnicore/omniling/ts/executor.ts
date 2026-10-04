// Executor OmniLang (TS) — mirror di omniling/py/omniling/executor.py.
// AST -> azioni reali via src/adapters/*. Mai throw fuori da run().
import { route } from "../../src/router.ts";
import { loadConfig } from "../../src/config.ts";
import { callHermesMcp, type HermesTool } from "../../src/adapters/hermes.ts";
import { opencode } from "../../src/adapters/opencode.ts";
import { openclaw } from "../../src/adapters/openclaw.ts";

type Ctx = Record<string, unknown>;

function resolve(v: { t: string; v: unknown }, ctx: Ctx): unknown {
  if (v.t === "var") return ctx[v.v as string];
  return v.v;
}

function truthy(x: unknown): boolean {
  if (x === null || x === undefined || x === false) return false;
  if (typeof x === "number" && x === 0) return false;
  if (typeof x === "string" && x.length === 0) return false;
  if (Array.isArray(x) && x.length === 0) return false;
  if (typeof x === "object" && Object.keys(x as object).length === 0) return false;
  return true;
}

function evalExpr(e: { l: { t: string; v: unknown }; op: string | null; r: { t: string; v: unknown } | null }, ctx: Ctx): boolean {
  const l = resolve(e.l, ctx);
  if (!e.op) return truthy(l);
  const r = resolve(e.r!, ctx);
  return e.op === "==" ? l === r : l !== r;
}

async function dispatch(
  system: { kind: string },
  tool: { call: string },
  args: Record<string, unknown>,
  ctx: Ctx,
  cfg: ReturnType<typeof loadConfig>,
): Promise<unknown> {
  const { kind, call } = { kind: system.kind, call: tool.call };
  if (kind === "memory") {
    return callHermesMcp(
      call as HermesTool,
      args as Record<string, unknown>,
      { python: cfg.hermesPython, hermesDir: cfg.hermesDir },
    );
  }
  if (kind === "hands") {
    if (call === "session/prompt") {
      const prompt = String(args["prompt"] ?? (ctx["text"] as string) ?? "");
      try {
        return await opencode.promptServer(
          prompt,
          { baseUrl: cfg.opencodeUrl, password: cfg.opencodePassword || undefined },
          typeof args["directory"] === "string" ? { directory: args["directory"] } : {},
        );
      } catch {
        return { fallback: "cli", out: (await opencode.promptCli(prompt)).slice(0, 2000) };
      }
    }
    throw new Error(`hands: call non supportata: '${call}' (v0.1: solo session/prompt)`);
  }
  if (kind === "face") {
    const oc = { baseUrl: cfg.openclawUrl, token: cfg.openclawToken || undefined };
    if (call === "announce") {
      return openclaw.announce(oc, String(args["result"] ?? args["message"] ?? ""));
    }
    return openclaw.rpc(oc, call, {});
  }
  throw new Error(`kind non supportato in v0.1: '${kind}' (memory|hands|face)`);
}

export async function run(ast: {
  systems: { name: string; kind: string; via: string }[];
  tools: { name: string; system: string; call: string; args: Record<string, { t: string; v: unknown }> }[];
  flows: { name: string; when: { l: { t: string; v: unknown }; op: string | null; r: { t: string; v: unknown } | null } | null; steps: Record<string, unknown>[] }[];
}, text: string): Promise<Record<string, unknown>> {
  const cfg = loadConfig();
  const ctx: Ctx = { text, intent: route({ text }).intent };
  const systems = Object.fromEntries(ast.systems.map((s) => [s.name, s]));
  const tools = Object.fromEntries(ast.tools.map((t) => [t.name, t]));
  const ran: string[] = [];
  const log: Record<string, unknown>[] = [];

  const runSteps = async (steps: Record<string, unknown>[]): Promise<void> => {
    for (const st of steps) {
      if ("if" in st) {
        const ok = evalExpr(st["if"] as { l: { t: string; v: unknown }; op: string | null; r: { t: string; v: unknown } | null }, ctx);
        log.push({ if: st["if"], taken: ok });
        if (ok) await runSteps(st["steps"] as Record<string, unknown>[]);
        continue;
      }
      const v = st["assign"] as string;
      const toolName = st["call"] as string | undefined;
      if (toolName === undefined) {
        ctx[v] = resolve(st["value"] as { t: string; v: unknown }, ctx);
        log.push({ assign: v, ok: true });
        continue;
      }
      const tool = tools[toolName];
      if (!tool) {
        log.push({ assign: v, call: toolName, ok: false, error: `tool sconosciuto: ${toolName}` });
        continue;
      }
      const system = systems[tool.system];
      if (!system) {
        log.push({ assign: v, call: toolName, ok: false, error: `system sconosciuto: ${tool.system}` });
        continue;
      }
      const merged: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(tool.args)) merged[k] = resolve(val, ctx);
      for (const [k, val] of Object.entries((st["args"] as Record<string, { t: string; v: unknown }>) ?? {})) {
        merged[k] = resolve(val, ctx);
      }
      try {
        ctx[v] = await dispatch(system, tool, merged, ctx, cfg);
        log.push({ assign: v, call: toolName, ok: true });
      } catch (e) {
        log.push({ assign: v, call: toolName, ok: false, error: String(e).slice(0, 300) });
      }
    }
  };

  for (const flow of ast.flows) {
    if (flow.when && !evalExpr(flow.when, ctx)) continue;
    ran.push(flow.name);
    await runSteps(flow.steps);
  }
  const vars: Ctx = {};
  for (const [k, v] of Object.entries(ctx)) if (k !== "text" && k !== "intent") vars[k] = v;
  return { flows: ran, vars, steps: log };
}
