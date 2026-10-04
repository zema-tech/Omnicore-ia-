// Hermes adapter — brain: memory, skills, cron, past conversations.
// Protocol: stdio MCP (`hermes mcp serve`) + CLI fallback.
// Verified surface in vendors/hermes/mcp_serve.py:
//   conversations_list, conversation_get, messages_read,
//   messages_send, channels_list, poll_events, list_pending_approvals
import { spawn } from "node:child_process";
import type { HermesConfig } from "../types.ts";

const TOOLS = [
  "conversations_list",
  "conversation_get",
  "messages_read",
  "messages_send",
  "channels_list",
  "poll_events",
  "list_pending_approvals",
] as const;

export type HermesTool = (typeof TOOLS)[number];

export function isHermesTool(name: string): name is HermesTool {
  return (TOOLS as readonly string[]).includes(name);
}

function resolveCfg(cfg: HermesConfig = {}) {
  return {
    python: cfg.python ?? "python3",
    hermesDir: cfg.hermesDir ?? new URL("../../../vendors/hermes", import.meta.url).pathname,
  };
}

/** Raw MCP stdio call to `hermes mcp serve`. No MCP SDK needed. */
export function callHermesMcp(tool: HermesTool, args: Record<string, unknown> = {}, cfg: HermesConfig = {}): Promise<unknown> {
  const { python, hermesDir } = resolveCfg(cfg);
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["mcp_serve.py"], { cwd: hermesDir });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", reject);
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    };
    child.stdin.write(JSON.stringify(payload) + "\n");
    child.stdin.end();
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`hermes mcp timeout. stderr: ${err.slice(0, 500)}`));
    }, 30_000);
    child.on("close", () => {
      clearTimeout(timer);
      const line = out.trim().split("\n").pop() ?? "";
      try {
        resolve(JSON.parse(line || "null"));
      } catch {
        reject(new Error(`hermes mcp bad JSON: ${line.slice(0, 500)} / stderr: ${err.slice(0, 500)}`));
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
    callHermesMcp("poll_events", { after_cursor, limit }, cfg),
};
