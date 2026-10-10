// Modulo WEB.SEARCH — ricerca web nativa (da studio Hermes Exa/Firecrawl/DDG).
// Provider: DuckDuckGo (gratis, no key) + Exa (opzionale, EXA_API_KEY).
// Catena: prova in ordine, al primo successo si ferma; se tutti falliscono,
// errore onesto cumulato. Solo GET/POST lettura, timeout, cap risultati.
// Zero dipendenze. Mai throw: sempre {ok, via, ...}.
export interface SearchHit { title: string; url: string; snippet: string; date?: string }
export interface SearchResult { ok: boolean; via: string; results: SearchHit[]; provider?: string; error?: string }

const VIA = "web(native-search)";
const UA = "Omnicore/0.3 (ricerca web, contatto: locale)";

function timeoutMs(): number {
  return Number(process.env["OMNICORE_WEBSEARCH_TIMEOUT_MS"] ?? "12000");
}

function clean(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs());
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: ctl.signal });
    if (!r.ok) throw new Error(`http ${r.status}`);
    const buf = new Uint8Array(await r.arrayBuffer().catch(() => new ArrayBuffer(0)));
    return new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 300_000));
  } finally {
    clearTimeout(t);
  }
}

/** DuckDuckGo html (no key). Base sovrascrivibile per test. */
async function searchDdg(query: string, max: number): Promise<SearchHit[]> {
  const base = (process.env["OMNICORE_DDG_BASE"] ?? "https://html.duckduckgo.com").replace(/\/$/, "");
  const html = await getText(`${base}/html/?q=${encodeURIComponent(query)}`);
  const linkRe = /class="result__a"[^>]*href="([^"]{1,800})"[^>]*>([\s\S]{1,300}?)<\/a>/gi;
  const snipRe = /class="result__snippet"[^>]*>([\s\S]{1,600}?)<\/a>/gi;
  const links: { url: string; title: string }[] = [];
  let m: RegExpExecArray | null;
  while (links.length < max && (m = linkRe.exec(html))) {
    const title = clean(m[2]).slice(0, 160);
    const url = resolveDdg(m[1]);
    if (title && url) links.push({ url, title });
  }
  const snips: string[] = [];
  while (snips.length < links.length && (m = snipRe.exec(html))) snips.push(clean(m[1]).slice(0, 300));
  return links.map((l, i) => ({ title: l.title, url: l.url, snippet: snips[i] ?? "" }));
}

/** Risolve gli href DDG: /l/?uddg=<target> → target, //host → https:. */
function resolveDdg(href: string): string {
  try {
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) return decodeURIComponent(uddg[1]);
  } catch { /* continua sotto */ }
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return "";
}

/** Exa (serve EXA_API_KEY). Base sovrascrivibile per test. */
async function searchExa(query: string, max: number): Promise<SearchHit[]> {
  const key = process.env["EXA_API_KEY"] ?? "";
  if (!key) throw new Error("EXA_API_KEY non impostata");
  const base = (process.env["OMNICORE_EXA_BASE"] ?? "https://api.exa.ai").replace(/\/$/, "");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs());
  try {
    const r = await fetch(`${base}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "User-Agent": UA },
      body: JSON.stringify({ query, numResults: max, type: "auto", contents: { text: { maxCharacters: 600 } } }),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`exa http ${r.status}`);
    const j = (await r.json().catch(() => null)) as any;
    const arr = Array.isArray(j?.results) ? j.results : [];
    return arr.slice(0, max).map((x: any) => ({
      title: String(x?.title ?? "").slice(0, 160),
      url: String(x?.url ?? ""),
      snippet: String(x?.text ?? x?.snippet ?? "").slice(0, 300),
      date: x?.publishedDate ? String(x.publishedDate).slice(0, 10) : undefined,
    })).filter((h: SearchHit) => h.url && h.title);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Ricerca con fallback: exa (se chiave) poi ddg, o solo il provider chiesto.
 * provider: "auto" | "ddg" | "exa".
 */
export async function webSearch(
  query: string,
  opts: { maxResults?: number; provider?: string } = {},
): Promise<SearchResult> {
  const q = String(query ?? "").trim();
  if (!q) return { ok: false, via: VIA, results: [], error: "web.search vuole {query}" };
  const max = Math.max(1, Math.min(opts.maxResults ?? 5, 10));
  const want = String(opts.provider ?? "auto").toLowerCase();
  const chain = want === "ddg" ? ["ddg"] : want === "exa" ? ["exa"]
    : process.env["EXA_API_KEY"] ? ["exa", "ddg"] : ["ddg"];
  const errors: string[] = [];
  for (const p of chain) {
    try {
      const results = p === "exa" ? await searchExa(q, max) : await searchDdg(q, max);
      if (results.length) return { ok: true, via: `${VIA}(${p})`, results, provider: p };
      errors.push(`${p}: nessun risultato`);
    } catch (e) {
      errors.push(`${p}: ${String(e).slice(0, 120)}`);
    }
  }
  return { ok: false, via: VIA, results: [], error: errors.join(" | ").slice(0, 300) || "nessun provider" };
}

export const websearch = { search: webSearch };
