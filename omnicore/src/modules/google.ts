// Modulo GOOGLE — Workspace via REST con token utente (niente OAuth flow qui:
// l'utente incolla un access token da console.cloud.google.com, noi chiamiamo).
// Gmail list/send + Calendar list/create. Token solo env GOOGLE_TOKEN.
// Zero dipendenze. Mai throw: sempre {ok, via, ...}.
export interface GResult<T> { ok: boolean; via: string; data?: T; error?: string }

const VIA = "google(workspace)";

function apiBase(): string {
  return (process.env["GOOGLE_API_BASE"] ?? "https://www.googleapis.com").replace(/\/$/, "");
}

function token(): string {
  return process.env["GOOGLE_TOKEN"] ?? "";
}

function needToken(): string | null {
  return token() ? null : "GOOGLE_TOKEN non impostato (access token OAuth da console.cloud.google.com)";
}

function timeoutMs(): number {
  return Number(process.env["OMNICORE_GOOGLE_TIMEOUT_MS"] ?? "15000");
}

async function gfetch(path: string, init: RequestInit = {}): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs());
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: ctl.signal,
    });
    const j = (await r.json().catch(() => null)) as any;
    if (r.status === 401) throw new Error("token non valido o scaduto (rinnovalo)");
    if (!r.ok) throw new Error(`google http ${r.status}: ${String(j?.error?.message ?? "").slice(0, 120)}`);
    return j;
  } finally {
    clearTimeout(t);
  }
}

/** Ultime email (mittente/oggetto/data). */
export async function gmailList(opts: { query?: string; limit?: number } = {}): Promise<GResult<{ messages: { id: string; from: string; subject: string; date: string }[] }>> {
  const err = needToken();
  if (err) return { ok: false, via: VIA, error: err };
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 20));
  try {
    const q = opts.query ? `?q=${encodeURIComponent(opts.query)}&maxResults=${limit}` : `?maxResults=${limit}`;
    const box = await gfetch(`/gmail/v1/users/me/messages${q}`);
    const ids: string[] = (box?.messages ?? []).map((m: any) => m?.id).filter(Boolean);
    const out = [];
    for (const id of ids) {
      const m = await gfetch(`/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
      const heads: Record<string, string> = {};
      for (const h of m?.payload?.headers ?? []) heads[String(h?.name ?? "").toLowerCase()] = String(h?.value ?? "");
      out.push({ id, from: (heads["from"] ?? "?").slice(0, 120), subject: (heads["subject"] ?? "(senza oggetto)").slice(0, 160), date: (heads["date"] ?? "").slice(0, 40) });
    }
    return { ok: true, via: `${VIA}(gmail)`, data: { messages: out } };
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

/** Invia email via Gmail API. */
export async function gmailSend(to: string, subject: string, text: string): Promise<GResult<{ id: string }>> {
  const err = needToken();
  if (err) return { ok: false, via: VIA, error: err };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, via: VIA, error: `destinatario invalido: ${to}` };
  if (!text.trim()) return { ok: false, via: VIA, error: "testo vuoto" };
  try {
    const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject.slice(0, 200)}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}`).toString("base64url");
    const j = await gfetch(`/gmail/v1/users/me/messages/send`, { method: "POST", body: JSON.stringify({ raw }) });
    return { ok: true, via: `${VIA}(gmail)`, data: { id: String(j?.id ?? "") } };
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

/** Prossimi eventi calendario. */
export async function gcalList(opts: { limit?: number; days?: number } = {}): Promise<GResult<{ events: { id: string; summary: string; start: string; end: string }[] }>> {
  const err = needToken();
  if (err) return { ok: false, via: VIA, error: err };
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 30));
  try {
    const now = new Date();
    const max = new Date(now.getTime() + (opts.days ?? 7) * 86400_000);
    const j = await gfetch(`/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now.toISOString())}&timeMax=${encodeURIComponent(max.toISOString())}&maxResults=${limit}&singleEvents=true&orderBy=startTime`);
    const events = ((j?.items ?? []) as any[]).map((e) => ({
      id: String(e?.id ?? ""),
      summary: String(e?.summary ?? "(senza titolo)").slice(0, 160),
      start: String(e?.start?.dateTime ?? e?.start?.date ?? ""),
      end: String(e?.end?.dateTime ?? e?.end?.date ?? ""),
    }));
    return { ok: true, via: `${VIA}(calendar)`, data: { events } };
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

/** Crea evento (ISO start/end, default 1h da start). */
export async function gcalCreate(summary: string, start: string, end = ""): Promise<GResult<{ id: string; link: string }>> {
  const err = needToken();
  if (err) return { ok: false, via: VIA, error: err };
  if (!summary.trim() || isNaN(Date.parse(start))) return { ok: false, via: VIA, error: "gcal.create vuole {summary, start ISO}" };
  try {
    const s = new Date(start);
    const e = end && !isNaN(Date.parse(end)) ? new Date(end) : new Date(s.getTime() + 3600_000);
    const j = await gfetch(`/calendar/v3/calendars/primary/events`, {
      method: "POST",
      body: JSON.stringify({ summary: summary.slice(0, 200), start: { dateTime: s.toISOString() }, end: { dateTime: e.toISOString() } }),
    });
    return { ok: true, via: `${VIA}(calendar)`, data: { id: String(j?.id ?? ""), link: String(j?.htmlLink ?? "") } };
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

export const google = { gmailList, gmailSend, gcalList, gcalCreate };
