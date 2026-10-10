// Modulo SLACK — backend reale via Web API (chat.postMessage).
// Ricezione: parser per Events API (webhook esterno) — niente socket mode,
// niente dipendenze. Token solo env SLACK_BOT_TOKEN (mai loggato).
// Zero dipendenze. Mai throw.
const CHUNK = 4000;

export interface SlackInbound { channel: string; user: string; text: string; ts: string }
export interface SlackResult<T> { ok: boolean; via: string; data?: T; error?: string }

function apiBase(): string {
  return (process.env["SLACK_API_BASE"] ?? "https://slack.com/api").replace(/\/$/, "");
}

function token(): string {
  return process.env["SLACK_BOT_TOKEN"] ?? "";
}

function needToken(): string | null {
  return token() ? null : "SLACK_BOT_TOKEN non impostato (api.slack.com/apps → OAuth bot token xoxb-)";
}

/** Invia testo a un canale (C…/D…) spezzato a 4000 char. */
export async function slackSend(channel: string, text: string): Promise<SlackResult<{ parts: number }>> {
  const err = needToken();
  if (err) return { ok: false, via: "slack(web-api)", error: err };
  if (!/^[A-Za-z0-9_-]{3,}$/.test(channel)) return { ok: false, via: "slack(web-api)", error: `channel invalido: ${channel}` };
  if (!text.trim()) return { ok: false, via: "slack(web-api)", error: "testo vuoto" };
  try {
    let parts = 0;
    let rest = text;
    while (rest) {
      const piece = rest.length > CHUNK ? rest.slice(0, CHUNK) : rest;
      rest = rest.length > CHUNK ? rest.slice(CHUNK) : "";
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), Number(process.env["OMNICORE_SLACK_TIMEOUT_MS"] ?? "15000"));
      try {
        const r = await fetch(`${apiBase()}/chat.postMessage`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel, text: piece }),
          signal: ctl.signal,
        });
        const j = (await r.json().catch(() => null)) as any;
        if (!r.ok || j?.ok !== true) throw new Error(`slack: ${String(j?.error ?? `http ${r.status}`).slice(0, 120)}`);
        parts++;
      } finally {
        clearTimeout(t);
      }
    }
    return { ok: true, via: "slack(web-api)", data: { parts } };
  } catch (e) {
    return { ok: false, via: "slack(web-api)", error: String(e).slice(0, 200) };
  }
}

/**
 * Parser Events API (payload webhook già verificato fuori): url_verification
 * → challenge; message/app_mention → inbound; resto → null. Puro, testabile.
 */
export function parseEvent(body: any): { challenge?: string; inbound?: SlackInbound } {
  if (!body || typeof body !== "object") return {};
  if (body.type === "url_verification" && typeof body.challenge === "string") {
    return { challenge: body.challenge };
  }
  const e = body.event;
  if (!e || typeof e !== "object") return {};
  if ((e.type === "message" || e.type === "app_mention") && !e.bot_id && !e.subtype) {
    const text = String(e.text ?? "");
    if (!text) return {};
    return { inbound: { channel: String(e.channel ?? ""), user: String(e.user ?? ""), text: text.slice(0, 2000), ts: String(e.ts ?? "") } };
  }
  return {};
}

export const slack = { send: slackSend, parse: parseEvent };
