// Modulo MATRIX — Client-Server API via HTTPS (send + sync long-poll).
// Auth: MATRIX_TOKEN diretto oppure login password (MATRIX_USER/PASS).
// Niente E2EE (solo stanze non cifrate). Zero dipendenze. Mai throw.
export interface MatrixInbound { room: string; sender: string; text: string }
export interface MatrixResult<T> { ok: boolean; via: string; data?: T; error?: string }

const VIA = "matrix(client-server)";

function base(): string {
  return (process.env["MATRIX_HOMESERVER"] ?? "https://matrix.org").replace(/\/$/, "");
}

function timeoutMs(): number {
  return Number(process.env["OMNICORE_MATRIX_TIMEOUT_MS"] ?? "20000");
}

async function token(): Promise<{ token: string; error?: string }> {
  if (process.env["MATRIX_TOKEN"]) return { token: process.env["MATRIX_TOKEN"] };
  const user = process.env["MATRIX_USER"] ?? "";
  const pass = process.env["MATRIX_PASS"] ?? "";
  if (!user || !pass) return { token: "", error: "MATRIX_TOKEN non impostato (oppure MATRIX_USER/PASS per login)" };
  try {
    const r = await fetch(`${base()}/_matrix/client/v3/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user }, password: pass }),
    });
    const j = (await r.json().catch(() => null)) as any;
    if (!r.ok || !j?.access_token) throw new Error(`login: ${String(j?.error ?? `http ${r.status}`).slice(0, 120)}`);
    return { token: String(j.access_token) };
  } catch (e) {
    return { token: "", error: String(e).slice(0, 160) };
  }
}

/** Invia testo in stanza (!id). */
export async function matrixSend(roomId: string, text: string): Promise<MatrixResult<{ event: string }>> {
  const t = await token();
  if (t.error) return { ok: false, via: VIA, error: t.error };
  if (!String(roomId ?? "").startsWith("!")) return { ok: false, via: VIA, error: `stanza invalida (!id): ${roomId}` };
  if (!String(text ?? "").trim()) return { ok: false, via: VIA, error: "testo vuoto" };
  try {
    const txn = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs());
    try {
      const r = await fetch(`${base()}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txn}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ msgtype: "m.text", body: text.slice(0, 4000) }),
        signal: ctl.signal,
      });
      const j = (await r.json().catch(() => null)) as any;
      if (!r.ok) throw new Error(`matrix http ${r.status}: ${String(j?.error ?? "").slice(0, 120)}`);
      return { ok: true, via: VIA, data: { event: String(j?.event_id ?? "") } };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

/** Long-poll /sync: messaggi nuovi da `since` (vuoto = solo batch, niente replay). */
export async function matrixSync(opts: { since?: string; timeoutSec?: number } = {}): Promise<MatrixResult<{ inbound: MatrixInbound[]; next: string }>> {
  const t = await token();
  if (t.error) return { ok: false, via: VIA, error: t.error };
  const secs = Math.max(0, Math.min(opts.timeoutSec ?? 20, 60));
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), (secs + 10) * 1000);
    try {
      const q = `?timeout=${secs * 1000}${opts.since ? `&since=${encodeURIComponent(opts.since)}` : ""}`;
      const r = await fetch(`${base()}/_matrix/client/v3/sync${q}`, {
        headers: { Authorization: `Bearer ${t.token}` },
        signal: ctl.signal,
      });
      const j = (await r.json().catch(() => null)) as any;
      if (!r.ok) throw new Error(`matrix http ${r.status}`);
      const inbound: MatrixInbound[] = [];
      const join = j?.rooms?.join ?? {};
      for (const [roomId, room] of Object.entries<any>(join)) {
        for (const e of room?.timeline?.events ?? []) {
          if (e?.type !== "m.room.message") continue;
          const text = String(e?.content?.body ?? "");
          if (!text || e?.content?.msgtype === "m.notice") continue;
          inbound.push({ room: roomId, sender: String(e?.sender ?? "?"), text: text.slice(0, 2000) });
          if (inbound.length >= 50) break;
        }
      }
      return { ok: true, via: VIA, data: { inbound, next: String(j?.next_batch ?? opts.since ?? "") } };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

export const matrix = { send: matrixSend, sync: matrixSync };
