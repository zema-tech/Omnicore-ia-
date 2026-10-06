// Facoltà PRESENZA — il volto fuso di Omnicore.
//
// status(): salute del gateway. announce(): diffusione best-effort verso i
// canali (i recapiti live passano dal gateway, mai dall'admin-rpc).
// Entrambe mai throw oltre il necessario: announce non fallisce mai.
import { openclaw } from "../adapters/openclaw.ts";
import { loadConfig } from "../config.ts";

function cfg() {
  const c = loadConfig();
  return { baseUrl: c.openclawUrl, token: c.openclawToken || undefined };
}

/** Stato gateway/presenza. Throw se offline (il chiamante decide come degradare). */
export function status(): Promise<unknown> {
  return openclaw.status(cfg());
}

/** Diffusione best-effort. Ritorna sempre {ok, detail}: mai throw. */
export async function announce(message: string, targets: string[] = []): Promise<{ ok: boolean; detail: unknown }> {
  try {
    const detail = await openclaw.announce(cfg(), targets.length ? `[to:${targets.join(",")}] ${message}` : message);
    if (detail !== null && typeof detail === "object" && (detail as any).ok === false) {
      return { ok: false, detail };
    }
    return { ok: true, detail };
  } catch (e) {
    return {
      ok: false,
      detail: `gateway non raggiungibile (${String(e).slice(0, 160)}). Messaggio trattenuto: ${message.slice(0, 200)}`,
    };
  }
}

export const channel = { status, announce };
