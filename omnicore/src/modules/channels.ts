// Modulo CANALI — presenza nativa di Omnicore (modellato su OpenClaw:
// channels/ + extensions telegram/whatsapp/discord/slack come backend).
//
// Channel = {id, kind, status(), send()}. Backend reali: console (log) e
// webhook (POST JSON). telegram/whatsapp/discord: richiedono token e
// restano needsConfig onesto finché non collegati. Zero dipendenze.
export type ChannelKind = "console" | "webhook" | "telegram" | "whatsapp" | "discord";

export interface ChannelDef {
  id: string;
  kind: ChannelKind;
  label?: string;
  url?: string; // webhook
}

export interface ChannelStatus {
  id: string;
  kind: ChannelKind;
  ok: boolean;
  detail: string;
}

function env(name: string): string {
  return process.env[name] ?? "";
}

/** Canali configurati: console sempre + webhook se OMNICORE_WEBHOOK_URL. */
export function listChannels(): ChannelDef[] {
  const out: ChannelDef[] = [{ id: "console", kind: "console", label: "log locale" }];
  if (env("OMNICORE_WEBHOOK_URL")) {
    out.push({ id: "webhook", kind: "webhook", url: env("OMNICORE_WEBHOOK_URL") });
  }
  if (env("TELEGRAM_BOT_TOKEN")) out.push({ id: "telegram", kind: "telegram" });
  if (env("WHATSAPP_TOKEN")) out.push({ id: "whatsapp", kind: "whatsapp" });
  if (env("DISCORD_WEBHOOK_URL")) out.push({ id: "discord", kind: "discord" });
  return out;
}

export function channelStatus(): ChannelStatus[] {
  return listChannels().map((c) => {
    if (c.kind === "console") return { id: c.id, kind: c.kind, ok: true, detail: "log locale attivo" };
    if (c.kind === "webhook") return { id: c.id, kind: c.kind, ok: true, detail: `POST ${c.url}` };
    return { id: c.id, kind: c.kind, ok: false, detail: `${c.kind}: backend non collegato (serve token/adapter dedicato)` };
  });
}

/** Invio nativo. Ritorna {ok, via, detail}. Mai throw. */
export async function channelSend(message: string, targets: string[] = []): Promise<{ ok: boolean; via: string; detail: string }> {
  const chans = listChannels();
  const wanted = targets.length ? chans.filter((c) => targets.includes(c.id)) : chans.filter((c) => c.kind === "console");
  if (!wanted.length) {
    return { ok: false, via: "channel", detail: `nessun canale tra: ${targets.join(",")}` };
  }
  const results: string[] = [];
  let allOk = true;
  for (const c of wanted) {
    if (c.kind === "console") {
      console.log(`[omnicore:${c.id}] ${message}`);
      results.push(`${c.id}: loggato`);
      continue;
    }
    if (c.kind === "webhook" && c.url) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 10000);
        try {
          const r = await fetch(c.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: message, from: "omnicore" }),
            signal: ctl.signal,
          });
          if (!r.ok) throw new Error(`http ${r.status}`);
          results.push(`${c.id}: consegnato`);
        } finally {
          clearTimeout(t);
        }
      } catch (e) {
        allOk = false;
        results.push(`${c.id}: fallito (${String(e).slice(0, 120)})`);
      }
      continue;
    }
    allOk = false;
    results.push(`${c.id}: non collegato (backend ${c.kind} da implementare)`);
  }
  return { ok: allOk, via: "channel(native)", detail: results.join(" | ") };
}

export const channels = { list: listChannels, status: channelStatus, send: channelSend };
