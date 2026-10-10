// Modulo TELEGRAM — backend reale via Bot API (da studio OpenClaw
// extensions/telegram: POST {base}/bot<token>/<method>, long-poll getUpdates).
// Solo HTTPS, token solo da env TELEGRAM_BOT_TOKEN (mai loggato, mai in repo).
// Testabile: TELEGRAM_API_BASE punta al server finto. Mai throw.
const CHUNK = 4000;

export interface TgInbound {
  updateId: number;
  chatId: number | string;
  chatType: string;
  from: string;
  text: string;
}

export interface TgResult<T> { ok: boolean; via: string; data?: T; error?: string }

function base(): string {
  return (process.env["TELEGRAM_API_BASE"] ?? "https://api.telegram.org").replace(/\/$/, "");
}

function token(): string {
  return process.env["TELEGRAM_BOT_TOKEN"] ?? "";
}

function timeoutMs(): number {
  return Number(process.env["OMNICORE_TELEGRAM_TIMEOUT_MS"] ?? "15000");
}

async function api<T>(method: string, params: Record<string, unknown>, timeout: number): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${base()}/bot${token()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: ctl.signal,
    });
    const body = await r.json().catch(() => null) as any;
    if (!r.ok || body?.ok !== true) {
      const desc = String(body?.description ?? `http ${r.status}`).slice(0, 160);
      throw new Error(`${method}: ${desc}`);
    }
    return body.result as T;
  } finally {
    clearTimeout(t);
  }
}

function needToken(): string | null {
  return token() ? null : "TELEGRAM_BOT_TOKEN non impostato (crea il bot con @BotFather)";
}

/** Chi è il bot (verifica token). */
export async function tgMe(): Promise<TgResult<{ id: number; username: string }>> {
  const err = needToken();
  if (err) return { ok: false, via: "telegram(bot-api)", error: err };
  try {
    const me = await api<any>("getMe", {}, timeoutMs());
    return { ok: true, via: "telegram(bot-api)", data: { id: me.id, username: String(me.username ?? "") } };
  } catch (e) {
    return { ok: false, via: "telegram(bot-api)", error: String(e).slice(0, 200) };
  }
}

function chunks(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > CHUNK) {
    let cut = rest.lastIndexOf("\n", CHUNK);
    if (cut < 1000) cut = CHUNK;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

/** Invia testo a una chat (spezzato a 4000 char). */
export async function tgSend(chatId: number | string, text: string): Promise<TgResult<{ parts: number }>> {
  const err = needToken();
  if (err) return { ok: false, via: "telegram(bot-api)", error: err };
  if (text.trim() === "") return { ok: false, via: "telegram(bot-api)", error: "testo vuoto" };
  try {
    let parts = 0;
    for (const c of chunks(text)) {
      await api("sendMessage", { chat_id: chatId, text: c }, timeoutMs());
      parts++;
    }
    return { ok: true, via: "telegram(bot-api)", data: { parts } };
  } catch (e) {
    return { ok: false, via: "telegram(bot-api)", error: String(e).slice(0, 200) };
  }
}

function parseUpdate(u: any): TgInbound | null {
  const m = u?.message ?? u?.edited_message ?? u?.channel_post;
  if (!m || typeof u?.update_id !== "number") return null;
  const text = String(m.text ?? m.caption ?? "");
  if (!text) return null;
  return {
    updateId: u.update_id,
    chatId: m.chat?.id,
    chatType: String(m.chat?.type ?? ""),
    from: String(m.from?.username ? `@${m.from.username}` : m.from?.id ?? "?"),
    text: text.slice(0, 2000),
  };
}

/** Long-poll messaggi in arrivo. Ritorna {inbound, nextOffset}. */
export async function tgPoll(opts: { offset?: number; timeoutSec?: number } = {}): Promise<TgResult<{ inbound: TgInbound[]; nextOffset?: number }>> {
  const err = needToken();
  if (err) return { ok: false, via: "telegram(bot-api)", error: err };
  const timeoutSec = Math.max(0, Math.min(opts.timeoutSec ?? 20, 50));
  try {
    const updates = await api<any[]>("getUpdates", {
      offset: opts.offset,
      timeout: timeoutSec,
      allowed_updates: ["message", "edited_message", "channel_post"],
    }, (timeoutSec + 10) * 1000);
    const inbound: TgInbound[] = [];
    let maxId = -1;
    for (const u of Array.isArray(updates) ? updates : []) {
      if (typeof u?.update_id === "number" && u.update_id > maxId) maxId = u.update_id;
      const p = parseUpdate(u);
      if (p) inbound.push(p);
    }
    return { ok: true, via: "telegram(bot-api)", data: { inbound, nextOffset: maxId >= 0 ? maxId + 1 : opts.offset } };
  } catch (e) {
    return { ok: false, via: "telegram(bot-api)", error: String(e).slice(0, 200) };
  }
}

export const telegram = { me: tgMe, send: tgSend, poll: tgPoll };
