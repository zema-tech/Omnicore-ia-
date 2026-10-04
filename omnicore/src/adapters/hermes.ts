// Hermes adapter — brain: memory, skills, cron, past conversations.
// Protocol: one-shot `scripts/hermes_bridge.py` (stdlib) che importa
// DIRETTAMENTE gli handler di vendors/hermes/mcp_serve.py. Niente pacchetto
// `mcp`, niente server persistente, niente hang: ogni chiamata esce subito.
// Superficie reale (vedi _TOOL_NAMES in mcp_serve.py):
//   conversations_list, conversation_get, messages_read, attachments_fetch,
//   events_poll, events_wait, messages_send, channels_list,
//   permissions_list_open, permissions_respond
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HermesConfig } from "../types.ts";

const TOOLS = [
  "conversations_list",
  "conversation_get",
  "messages_read",
  "attachments_fetch",
  "events_poll",
  "events_wait",
  "messages_send",
  "channels_list",
  "permissions_list_open",
  "permissions_respond",
] as const;

export type HermesTool = (typeof TOOLS)[number];

export function isHermesTool(name: string): name is HermesTool {
  return (TOOLS as readonly string[]).includes(name);
}

const HERE = dirname(fileURLToPath(import.meta.url));

function resolveCfg(cfg: HermesConfig = {}) {
  return {
    python: cfg.python ?? process.env["HERMES_PYTHON"] ?? "python3",
    hermesDir:
      cfg.hermesDir ??
      process.env["HERMES_DIR"] ??
      new URL("../../../vendors/hermes", import.meta.url).pathname,
    bridge: join(HERE, "..", "..", "scripts", "hermes_bridge.py"),
  };
}

/** One-shot verso il bridge: `python3 hermes_bridge.py <tool> '<json>'`. Esce sempre. */
export function callHermesMcp(tool: HermesTool, args: Record<string, unknown> = {}, cfg: HermesConfig = {}): Promise<unknown> {
  const { python, hermesDir, bridge } = resolveCfg(cfg);
  return new Promise((resolve, reject) => {
    const child = spawn(python, [bridge, tool, JSON.stringify(args)], {
      env: { ...process.env, HERMES_DIR: hermesDir },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", reject);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("hermes bridge timeout (30s)"));
    }, 30_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`hermes bridge exit ${code}: ${err.slice(0, 500)}`));
        return;
      }
      try {
        resolve(JSON.parse(out.trim() || "null"));
      } catch {
        reject(new Error(`hermes bridge bad JSON: ${out.slice(0, 500)}`));
      }
    });
  });
}

/** High-level helpers used by the router. */
export const hermes = {
  tools: TOOLS,
  recall: (search: string, limit = 10, cfg?: HermesConfig) =>
    callHermesMcp("conversations_list", { search, limit }, cfg),
  read: (session_key: string, limit = 50, cfg?: HermesConfig) =>
    callHermesMcp("messages_read", { session_key, limit }, cfg),
  send: (target: string, message: string, cfg?: HermesConfig) =>
    callHermesMcp("messages_send", { target, message }, cfg),
  poll: (after_cursor = 0, limit = 20, cfg?: HermesConfig) =>
    callHermesMcp("events_poll", { after_cursor, limit }, cfg),
  channels: (cfg?: HermesConfig) => callHermesMcp("channels_list", {}, cfg),
};
