// OpenClaw adapter — face: gateway, channels, policy, ops.
// OpenClaw exposes gateway + admin-http-rpc extension
// (see vendors/openclaw/extensions/admin-http-rpc).
// We talk HTTP to it; no direct import of its 742MB tree.
import type { OpenClawConfig } from "../types.ts";

function headers(cfg: OpenClawConfig): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.token) h["Authorization"] = `Bearer ${cfg.token}`;
  return h;
}

async function rpc<T>(cfg: OpenClawConfig, method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(new URL("/rpc", cfg.baseUrl), {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ method, params }),
  });
  if (!res.ok) throw new Error(`openclaw rpc ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json() as Promise<T>;
}

/** Send a message to a channel via the gateway. */
export function sendMessage(cfg: OpenClawConfig, target: string, message: string) {
  return rpc(cfg, "message.send", { target, message });
}

/** Broadcast / ops hook: cron result, deploy notice, etc. */
export function announce(cfg: OpenClawConfig, message: string, targets: string[] = []) {
  return rpc(cfg, "message.broadcast", { message, targets });
}

export const openclaw = { rpc, sendMessage, announce };
