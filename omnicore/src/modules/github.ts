// Modulo GITHUB — lettore discussioni/diff (stile OpenClaw github reader).
// REST api.github.com via fetch, token opzionale GITHUB_TOKEN (rate limit).
// Solo lettura: niente confirm (come le altre letture). Zero dipendenze.
export type GhType = "issues" | "pulls" | "commits" | "diff";
export interface GhResult { ok: boolean; via: string; data?: unknown; error?: string }

const VIA = "github(api)";

function apiBase(): string {
  return (process.env["GITHUB_API_BASE"] ?? "https://api.github.com").replace(/\/$/, "");
}

function headers(accept = "application/vnd.github+json"): Record<string, string> {
  const h: Record<string, string> = { Accept: accept, "User-Agent": "Omnicore/0.3", "X-GitHub-Api-Version": "2022-11-28" };
  const t = process.env["GITHUB_TOKEN"] ?? "";
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

function checkRepo(repo: string): string | null {
  return /^[\w.-]+\/[\w.-]+$/.test(repo.trim()) ? null : `repo invalido (owner/name): ${repo.slice(0, 80)}`;
}

async function get(path: string, accept?: string): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), Number(process.env["OMNICORE_GITHUB_TIMEOUT_MS"] ?? "15000"));
  try {
    const r = await fetch(`${apiBase()}${path}`, { headers: headers(accept), signal: ctl.signal });
    if (r.status === 404) throw new Error("non trovato (repo privato senza token?)");
    if (r.status === 401) throw new Error("token non valido");
    if (r.status === 403) throw new Error("rate limit (metti GITHUB_TOKEN)");
    if (!r.ok) throw new Error(`github http ${r.status}`);
    return accept?.includes("diff") ? r.text() : r.json();
  } finally {
    clearTimeout(t);
  }
}

const pick = (o: any, keys: string[]) => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (o?.[k] !== undefined) out[k] = o[k];
  return out;
};

/**
 * Legge GitHub: issues|pulls|commits (liste) o diff (pull|commit).
 * opts.number serve per diff/PR/commit singoli. Mai throw.
 */
export async function ghRead(
  repo: string,
  type: string,
  opts: { limit?: number; number?: number; state?: string } = {},
): Promise<GhResult> {
  const bad = checkRepo(repo);
  if (bad) return { ok: false, via: VIA, error: bad };
  const limit = Math.max(1, Math.min(opts.number ? 1 : (opts.limit ?? 10), 30));
  const t = (type === "pulls" || type === "commits" || type === "diff" ? type : "issues") as GhType;
  try {
    if (t === "diff") {
      if (!opts.number) return { ok: false, via: VIA, error: "diff vuole {repo, number} (PR o commit)" };
      // prova PR poi commit
      try {
        const d = await get(`/repos/${repo}/pulls/${opts.number}`, "application/vnd.github.diff");
        return { ok: true, via: VIA, data: { kind: "pull-diff", number: opts.number, diff: String(d).slice(0, 8000) } };
      } catch {
        const d = await get(`/repos/${repo}/commits/${opts.number}`, "application/vnd.github.diff");
        return { ok: true, via: VIA, data: { kind: "commit-diff", number: opts.number, diff: String(d).slice(0, 8000) } };
      }
    }
    if (t === "commits") {
      const arr = await get(`/repos/${repo}/commits?per_page=${limit}`);
      const data = (Array.isArray(arr) ? arr : []).map((c: any) => ({
        sha: String(c?.sha ?? "").slice(0, 12),
        ...pick(c?.commit ?? {}, ["message", "author"]),
        date: c?.commit?.author?.date,
      }));
      return { ok: true, via: VIA, data };
    }
    const endpoint = t === "pulls" ? "pulls" : "issues";
    const q = t === "pulls" ? `?state=${opts.state ?? "open"}&per_page=${limit}` : `?state=${opts.state ?? "open"}&per_page=${limit}`;
    const arr = await get(`/repos/${repo}/${endpoint}${q}`);
    const data = (Array.isArray(arr) ? arr : []).map((i: any) => ({
      ...pick(i, ["number", "title", "state", "user", "created_at", "updated_at", "comments", "html_url"]),
      user: i?.user?.login,
      labels: (i?.labels ?? []).map((l: any) => l?.name),
    }));
    return { ok: true, via: VIA, data };
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

export const github = { read: ghRead };
