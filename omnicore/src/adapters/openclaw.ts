// OpenClaw adapter — face: gateway, policy, ops.
// Superficie REALE verificata in vendors/openclaw/extensions/admin-http-rpc:
//   POST {baseUrl}/api/v1/admin/rpc  body {id, method, params}
//   allowlist: status, commands.list, config.get, channels.status,
//   cron.status/list/add/..., agents.list/create/..., node.list, ...
// Il recapito live dei messaggi passa dal gateway WS / canali collegati
// (Telegram/WhatsApp/...), NON dall'admin-rpc: per questo `announce`
// schedula un job cron one-shot best-effort e non fallisce mai la pipeline.
import type { OpenClawConfig } from "../types.ts";

const RPC_PATH = "/api/v1/admin/rpc";

function headers(cfg: OpenClawConfig): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.token) h["Authorization"] = `Bearer ${cfg.token}`;
  return h;
}

let seq = 0;

/** RPC generico verso l'admin-http-rpc di OpenClaw. */
export async function rpc<T>(cfg: OpenClawConfig, method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(new URL(RPC_PATH, cfg.baseUrl), {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ id: `omnicore-${++seq}`, method, params }),
  });
  if (!res.ok) throw new Error(`openclaw rpc ${method} -> ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json() as Promise<T>;
}

/** Health del gateway (metodo allowlist `status`). */
export function status(cfg: OpenClawConfig) {
  return rpc(cfg, "status", {});
}

/** Comandi disponibili sul gateway (`commands.list`). */
export function commandsList(cfg: OpenClawConfig) {
  return rpc(cfg, "commands.list", {});
}

/** Job schedulati (`cron.list`). */
export function cronList(cfg: OpenClawConfig) {
  return rpc(cfg, "cron.list", {});
}

/** Agent registrati (`agents.list`). */
export function agentsList(cfg: OpenClawConfig) {
  return rpc(cfg, "agents.list", {});
}

/** Stato canali collegati (`channels.status`). */
export function channelsStatus(cfg: OpenClawConfig) {
  return rpc(cfg, "channels.status", {});
}

/**
 * Broadcast ops best-effort: prova a schedulare un job che contiene
 * il messaggio. Ritorna sempre {ok, detail}: mai throw oltre il fetch.
 */
export async function announce(cfg: OpenClawConfig, message: string): Promise<unknown> {
  try {
    return await rpc(cfg, "cron.add", {
      job: {
        name: "omnicore-announce",
        schedule: { kind: "once", at: new Date().toISOString() },
        payload: { kind: "announce", message },
      },
    });
  } catch (e) {
    return {
      ok: false,
      hint: `announce via cron.add non riuscita (${String(e).slice(0, 200)}). Il recapito live passa dal gateway WS/canali di OpenClaw.`,
      message,
    };
  }
}

/** Invia a un target via gateway WS — placeholder onesto: usa cron finché
 *  il gateway non espone message.send sull'admin-rpc (oggi NON allowlist). */
export function sendMessage(cfg: OpenClawConfig, target: string, message: string) {
  return announce(cfg, `[to:${target}] ${message}`);
}

export const openclaw = { rpc, status, commandsList, cronList, agentsList, channelsStatus, announce, sendMessage };
