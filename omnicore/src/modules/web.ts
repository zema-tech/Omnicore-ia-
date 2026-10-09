// Modulo WEB — browser da lettura di Omnicore (modellato su OpenClaw browser
// + Hermes browser_tool, ma senza Chromium: fetch nativo + html→testo).
// Solo lettura pubblica: niente login, niente form, niente script.
// Anti-SSRF: solo http/https, host pubblici (niente localhost/reti private/
// metadata cloud) salvo OMNICORE_WEB_ALLOW_LOCAL=1 (test). Redirect seguiti
// a mano (max 5) rivalidando ogni hop. Mai throw: sempre {ok, via, ...}.
import { lookup } from "node:dns/promises";

const VIA = "web(native-fetch)";
const MAX_REDIRECTS = 5;
const MAX_BYTES = 200_000;
const MAX_TEXT = 6000;
const MAX_LINKS = 30;

export interface WebLink { text: string; href: string }
export interface WebPage { url: string; finalUrl: string; title: string; text: string; links: WebLink[] }
export interface WebResult { ok: boolean; via: string; page?: WebPage; error?: string }

function allowLocal(): boolean {
  return process.env["OMNICORE_WEB_ALLOW_LOCAL"] === "1";
}

function isPublicIp(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l !== "::1" && !l.startsWith("fe80:") && !l.startsWith("fc") && !l.startsWith("fd");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (p[0] === 10 || p[0] === 127) return false;
  if (p[0] === 169 && p[1] === 254) return false; // metadata cloud
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
  if (p[0] === 192 && p[1] === 168) return false;
  if (p[0] === 0 || p[0] >= 224) return false;
  return true;
}

/** Host consentito: pubblico, o locale solo con flag esplicita (test). */
async function checkHost(hostname: string): Promise<string | null> {
  const h = hostname.toLowerCase();
  if (["localhost", "::1"].includes(h) || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return allowLocal() ? null : `host non pubblico: ${hostname}`;
  }
  let addrs;
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    return `dns fallito: ${hostname}`;
  }
  for (const a of addrs) {
    if (!isPublicIp(a.address) && !allowLocal()) return `ip non pubblico: ${a.address}`;
  }
  return null;
}

function parseUrl(raw: string): { url: URL; error?: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { url: null as never, error: `url invalida: ${raw.slice(0, 120)}` };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { url: u, error: `solo http/https: ${u.protocol}` };
  }
  if (u.username || u.password) return { url: u, error: "credenziali nell'url vietate" };
  return { url: u };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return "";
      }
    });
}

function htmlToText(html: string): { title: string; text: string; links: WebLink[] } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1] ?? "").trim());
  const links: WebLink[] = [];
  const linkRe = /<a\s[^>]*href=["']([^"'#]{1,500})["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while (links.length < MAX_LINKS && (m = linkRe.exec(html))) {
    const txt = decodeEntities(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 120);
    if (txt) links.push({ text: txt, href: m[1] });
  }
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trim().slice(0, MAX_TEXT);
  return { title, text, links };
}

async function readCapped(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
  const slice = buf.slice(0, MAX_BYTES);
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } catch {
    return "";
  }
}

/** Legge una pagina pubblica. Solo GET, timeout, niente credenziali. Mai throw. */
export async function webFetch(rawUrl: string, opts: { timeoutMs?: number } = {}): Promise<WebResult> {
  const timeoutMs = opts.timeoutMs ?? Number(process.env["OMNICORE_WEB_TIMEOUT_MS"] ?? "15000");
  const first = parseUrl(rawUrl);
  if (first.error) return { ok: false, via: VIA, error: first.error };
  let current = first.url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const blocked = await checkHost(current.hostname);
    if (blocked) return { ok: false, via: VIA, error: blocked };

    let res: Response;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        res = await fetch(current.toString(), {
          method: "GET",
          redirect: "manual",
          signal: ctl.signal,
          headers: { "User-Agent": "Omnicore/0.2 (lettura pagine, contatto: locale)", Accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.5" },
        });
      } finally {
        clearTimeout(t);
      }
    } catch (e) {
      return { ok: false, via: VIA, error: `fetch fallito: ${String(e).slice(0, 160)}` };
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, via: VIA, error: `redirect ${res.status} senza location` };
      const next = parseUrl(new URL(loc, current).toString());
      if (next.error) return { ok: false, via: VIA, error: next.error };
      current = next.url;
      await res.arrayBuffer().catch(() => null);
      continue;
    }
    if (!res.ok) {
      await res.arrayBuffer().catch(() => null);
      return { ok: false, via: VIA, error: `http ${res.status} su ${current.hostname}` };
    }

    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    const raw = await readCapped(res);
    if (!raw) return { ok: false, via: VIA, error: "corpo vuoto o illeggibile" };
    if (ctype.includes("application/json")) {
      let pretty = raw;
      try {
        pretty = JSON.stringify(JSON.parse(raw), null, 2);
      } catch { /* testo così com'è */ }
      return { ok: true, via: VIA, page: { url: rawUrl, finalUrl: current.toString(), title: "", text: pretty.slice(0, MAX_TEXT), links: [] } };
    }
    if (ctype.includes("text/") || ctype.includes("html") || ctype.includes("xml") || !ctype) {
      const { title, text, links } = htmlToText(raw);
      if (!text) return { ok: false, via: VIA, error: "nessun testo estraibile (forse anti-bot o binario)" };
      return { ok: true, via: VIA, page: { url: rawUrl, finalUrl: current.toString(), title, text, links } };
    }
    return { ok: false, via: VIA, error: `tipo non leggibile: ${ctype.split(";")[0]}` };
  }
  return { ok: false, via: VIA, error: `troppi redirect (>${MAX_REDIRECTS})` };
}

export const web = { fetch: webFetch };
