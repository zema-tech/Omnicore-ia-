// Modulo DISCORD — backend reale via Bot REST + Gateway WS (da studio OpenClaw).
// Invio: POST {base}/channels/{id}/messages (Bot token).
// Lettura: Gateway wss (Hello → Identify → heartbeat → MESSAGE_CREATE dispatch).
// Token solo env DISCORD_BOT_TOKEN (mai loggato). Base sovrascrivibile per test.
// Zero dipendenze (fetch + WebSocket built-in). Mai throw.
const CHUNK = 2000;

export interface DiscordInbound { id: string; channelId: string; author: string; text: string }
export interface DiscordResult<T> { ok: boolean; via: string; data?: T; error?: string }

function restBase(): string {
  return (process.env["DISCORD_API_BASE"] ?? "https://discord.com/api/v10").replace(/\/$/, "");
}

function gwUrl(): string {
  if (process.env["DISCORD_GW_URL"]) return process.env["DISCORD_GW_URL"];
  return "wss://gateway.discord.gg/?v=10&encoding=json";
}

function token(): string {
  return process.env["DISCORD_BOT_TOKEN"] ?? "";
}

function timeoutMs(): number {
  return Number(process.env["OMNICORE_DISCORD_TIMEOUT_MS"] ?? "15000");
}

function needToken(): string | null {
  return token() ? null : "DISCORD_BOT_TOKEN non impostato (https://discord.com/developers/applications)";
}

/** Invia testo a un canale (spezzato a 2000 char). */
export async function discordSend(channelId: string, text: string): Promise<DiscordResult<{ parts: number }>> {
  const err = needToken();
  if (err) return { ok: false, via: "discord(bot-api)", error: err };
  if (!/^\d+$/.test(channelId)) return { ok: false, via: "discord(bot-api)", error: `channel id invalido: ${channelId}` };
  if (!text.trim()) return { ok: false, via: "discord(bot-api)", error: "testo vuoto" };
  try {
    let parts = 0;
    let rest = text;
    while (rest) {
      const piece = rest.length > CHUNK ? rest.slice(0, CHUNK) : rest;
      rest = rest.length > CHUNK ? rest.slice(CHUNK) : "";
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs());
      try {
        const r = await fetch(`${restBase()}/channels/${channelId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${token()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ content: piece }),
          signal: ctl.signal,
        });
        if (!r.ok) throw new Error(`discord http ${r.status}: ${(await r.text().catch(() => "")).slice(0, 120)}`);
        parts++;
      } finally {
        clearTimeout(t);
      }
    }
    return { ok: true, via: "discord(bot-api)", data: { parts } };
  } catch (e) {
    return { ok: false, via: "discord(bot-api)", error: String(e).slice(0, 200) };
  }
}

/** Estrae un messaggio inbound da un dispatch MESSAGE_CREATE (puro, testabile). */
export function parseDispatch(d: any): DiscordInbound | null {
  if (d?.t !== "MESSAGE_CREATE" || !d?.d) return null;
  const m = d.d;
  const text = String(m.content ?? "");
  if (!text || m.author?.bot) return null; // niente vuoti, niente loop su bot
  return {
    id: String(m.id ?? ""),
    channelId: String(m.channel_id ?? ""),
    author: String(m.author?.username ?? "?"),
    text: text.slice(0, 2000),
  };
}

/**
 * Ascolta il gateway per timeoutSec e raccoglie i messaggi (bounded, poi chiude).
 * Intents: guild+DM+contenuto (1|512|32768). Mai throw.
 */
export async function discordListen(opts: { timeoutSec?: number } = {}): Promise<DiscordResult<{ inbound: DiscordInbound[] }>> {
  const err = needToken();
  if (err) return { ok: false, via: "discord(gateway)", error: err };
  if (typeof WebSocket === "undefined") return { ok: false, via: "discord(gateway)", error: "WebSocket non disponibile in questo runtime" };
  const timeoutSec = Math.max(1, Math.min(opts.timeoutSec ?? 20, 120));
  return new Promise((resolve) => {
    const inbound: DiscordInbound[] = [];
    let hb: ReturnType<typeof setInterval> | null = null;
    let seq: number | null = null;
    let finished = false;
    const done = (r: DiscordResult<{ inbound: DiscordInbound[] }>) => {
      if (finished) return;
      finished = true;
      if (hb) clearInterval(hb);
      try {
        ws.close();
      } catch { /* chiusura best-effort */ }
      resolve(r);
    };
    let ws: WebSocket;
    try {
      ws = new WebSocket(gwUrl());
    } catch (e) {
      resolve({ ok: false, via: "discord(gateway)", error: String(e).slice(0, 160) });
      return;
    }
    const killer = setTimeout(() => done({ ok: true, via: "discord(gateway)", data: { inbound } }), timeoutSec * 1000);
    const beat = (ms: number) => {
      if (hb) clearInterval(hb);
      hb = setInterval(() => {
        try {
          ws.send(JSON.stringify({ op: 1, d: seq }));
        } catch { /* ignora */ }
      }, ms);
      try {
        ws.send(JSON.stringify({ op: 1, d: seq }));
      } catch { /* ignora */ }
    };
    ws.onopen = () => {};
    let netError = "";
    ws.onmessage = (ev) => {
      let m: any;
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (typeof m?.s === "number") seq = m.s;
      if (m?.op === 10) {
        beat(Number(m.d?.heartbeat_interval ?? 41250));
        try {
          ws.send(JSON.stringify({
            op: 2,
            d: { token: token(), intents: 33281, properties: { os: "linux", browser: "omnicore", device: "omnicore" } },
          }));
        } catch {
          netError = "identify fallito";
        }
      } else if (m?.op === 0) {
        const p = parseDispatch(m);
        if (p) inbound.push(p);
      } else if (m?.op === 9) {
        netError = "sessione gateway invalida (token?)";
      }
    };
    ws.onerror = () => {
      netError = netError || "connessione gateway fallita";
    };
    ws.onclose = () => {
      clearTimeout(killer);
      // Chiusura = fine dell'ascolto bounded: ok con quanto raccolto,
      // ko solo se non si è mai connesso davvero (errore + zero messaggi).
      if (inbound.length || !netError) done({ ok: true, via: "discord(gateway)", data: { inbound } });
      else done({ ok: false, via: "discord(gateway)", error: netError });
    };
  });
}

export const discord = { send: discordSend, listen: discordListen, parse: parseDispatch };
