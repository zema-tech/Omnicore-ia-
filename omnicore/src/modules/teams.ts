// Modulo TEAMS — invio via Graph con client-credentials Azure (niente bot
// framework: serve app registrata con ChannelMessage.Send). Ricezione vera
// richiede endpoint bot (documentato, non implementato). Zero dipendenze.
export interface TeamsResult<T> { ok: boolean; via: string; data?: T; error?: string }

const VIA = "teams(graph)";

function conf(): { tenant: string; client: string; secret: string } | null {
  const tenant = process.env["TEAMS_TENANT_ID"] ?? "";
  const client = process.env["TEAMS_CLIENT_ID"] ?? "";
  const secret = process.env["TEAMS_CLIENT_SECRET"] ?? "";
  return tenant && client && secret ? { tenant, client, secret } : null;
}

async function graphToken(): Promise<string> {
  const c = conf();
  if (!c) throw new Error("TEAMS_TENANT_ID/CLIENT_ID/CLIENT_SECRET mancanti (app Azure con ChannelMessage.Send)");
  const loginBase = (process.env["TEAMS_LOGIN_BASE"] ?? "https://login.microsoftonline.com").replace(/\/$/, "");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const body = new URLSearchParams({
      client_id: c.client,
      client_secret: c.secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });
    const r = await fetch(`${loginBase}/${c.tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctl.signal,
    });
    const j = (await r.json().catch(() => null)) as any;
    if (!r.ok || !j?.access_token) throw new Error(`token azure: ${String(j?.error_description ?? `http ${r.status}`).slice(0, 140)}`);
    return String(j.access_token);
  } finally {
    clearTimeout(t);
  }
}

/** Invia messaggio in team/canale (default da env). */
export async function teamsSend(text: string, opts: { team?: string; channel?: string } = {}): Promise<TeamsResult<{ id: string }>> {
  const team = opts.team ?? process.env["TEAMS_TEAM_ID"] ?? "";
  const channel = opts.channel ?? process.env["TEAMS_CHANNEL_ID"] ?? "";
  if (!team || !channel) return { ok: false, via: VIA, error: "TEAMS_TEAM_ID/CHANNEL_ID mancanti (o args team/channel)" };
  if (!String(text ?? "").trim()) return { ok: false, via: VIA, error: "testo vuoto" };
  try {
    const tok = await graphToken();
    const graphBase = (process.env["TEAMS_GRAPH_BASE"] ?? "https://graph.microsoft.com/v1.0").replace(/\/$/, "");
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(`${graphBase}/teams/${team}/channels/${channel}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body: { contentType: "text", content: String(text).slice(0, 4000) } }),
        signal: ctl.signal,
      });
      const j = (await r.json().catch(() => null)) as any;
      if (!r.ok) throw new Error(`graph http ${r.status}: ${String(j?.error?.message ?? "").slice(0, 140)}`);
      return { ok: true, via: VIA, data: { id: String(j?.id ?? "") } };
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 220) };
  }
}

export const teams = { send: teamsSend };
