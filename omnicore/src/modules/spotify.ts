// Modulo SPOTIFY — Web API con token utente (niente OAuth flow qui:
// token da developer.spotify.com, SPOTIFY_TOKEN). search, stato player,
// play/pause/next. Zero dipendenze. Mai throw: sempre {ok, via, ...}.
export interface SResult<T> { ok: boolean; via: string; data?: T; error?: string }

const VIA = "spotify(web-api)";

function apiBase(): string {
  return (process.env["SPOTIFY_API_BASE"] ?? "https://api.spotify.com/v1").replace(/\/$/, "");
}

function token(): string {
  return process.env["SPOTIFY_TOKEN"] ?? "";
}

function needToken(): string | null {
  return token() ? null : "SPOTIFY_TOKEN non impostato (token OAuth da developer.spotify.com)";
}

async function sfetch(path: string, init: RequestInit = {}): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), Number(process.env["OMNICORE_SPOTIFY_TIMEOUT_MS"] ?? "15000"));
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: ctl.signal,
    });
    if (r.status === 204) return null;
    const j = (await r.json().catch(() => null)) as any;
    if (r.status === 401) throw new Error("token non valido o scaduto");
    if (!r.ok) throw new Error(`spotify http ${r.status}: ${String(j?.error?.message ?? "").slice(0, 120)}`);
    return j;
  } finally {
    clearTimeout(t);
  }
}

/** Cerca brani. */
export async function spotSearch(query: string, limit = 5): Promise<SResult<{ tracks: { name: string; artist: string; id: string }[] }>> {
  const err = needToken();
  if (err) return { ok: false, via: VIA, error: err };
  if (!query.trim()) return { ok: false, via: VIA, error: "query vuota" };
  try {
    const j = await sfetch(`/search?q=${encodeURIComponent(query)}&type=track&limit=${Math.max(1, Math.min(limit, 20))}`);
    const tracks = ((j?.tracks?.items ?? []) as any[]).map((t) => ({
      name: String(t?.name ?? "").slice(0, 120),
      artist: ((t?.artists ?? []) as any[]).map((a) => a?.name).filter(Boolean).join(", ").slice(0, 120),
      id: String(t?.id ?? ""),
    }));
    return { ok: true, via: VIA, data: { tracks } };
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

/** Stato player (null = niente in riproduzione). */
export async function spotState(): Promise<SResult<{ playing: boolean; track: string; device: string } | null>> {
  const err = needToken();
  if (err) return { ok: false, via: VIA, error: err };
  try {
    const j = await sfetch(`/me/player/currently-playing`);
    if (!j) return { ok: true, via: VIA, data: null };
    return {
      ok: true, via: VIA,
      data: {
        playing: j.is_playing === true,
        track: `${j?.item?.name ?? "?"} — ${((j?.item?.artists ?? []) as any[]).map((a) => a?.name).join(", ")}`.slice(0, 160),
        device: String(j?.device?.name ?? "?").slice(0, 80),
      },
    };
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

/** Controllo: play | pause | next. Cambia stato reale. */
export async function spotControl(op: string): Promise<SResult<{ op: string }>> {
  const err = needToken();
  if (err) return { ok: false, via: VIA, error: err };
  const path = op === "pause" ? "/me/player/pause" : op === "next" ? "/me/player/next" : op === "play" ? "/me/player/play" : "";
  if (!path) return { ok: false, via: VIA, error: `op invalida (play|pause|next): ${op}` };
  try {
    const method = op === "next" ? "POST" : "PUT";
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(`${apiBase()}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        signal: ctl.signal,
      });
      if (r.status === 401) throw new Error("token non valido o scaduto");
      if (!r.ok && r.status !== 204) throw new Error(`spotify http ${r.status}`);
      return { ok: true, via: VIA, data: { op } };
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

export const spotify = { search: spotSearch, state: spotState, control: spotControl };
