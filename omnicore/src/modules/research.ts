// Modulo RESEARCH — deep research multi-step (da studio Odysseus).
// Pipeline: query → websearch → lettura fonti (web.fetch) → sintesi → report
// Markdown con citazioni, archiviato nel vault. Sintesi via LLM se c'è,
// altrimenti estrattiva (primi paragrafi). Budget: max fonti/profondità.
// Solo lettura pubblica. Zero dipendenze. Mai throw.
import { websearch } from "./websearch.ts";
import { web } from "./web.ts";
import { llmChat } from "../mind/llm.ts";
import { saveNote } from "../vault/notes.ts";

export interface ResearchSource { title: string; url: string; excerpt: string }
export interface ResearchReport { query: string; date: string; sources: ResearchSource[]; synthesis: string; markdown: string; file?: string }
export interface ResearchResult { ok: boolean; via: string; report?: ResearchReport; error?: string }

const VIA = "research(native)";

function extractive(texts: string[], query: string): string {
  const paras = texts
    .flatMap((t) => t.split(/\n{2,}|\.\s+/))
    .map((p) => p.trim())
    .filter((p) => p.length > 60)
    .slice(0, 6);
  if (!paras.length) return `Nessun passaggio utile su "${query}" nelle fonti lette.`;
  return `Estratti rilevanti su "${query}":\n` + paras.map((p) => `- ${p.slice(0, 280)}`).join("\n");
}

/**
 * Ricerca approfondita: cerca, legge le prime fonti, sintetizza, archivia.
 * Mai throw: fallimenti onesti con fonti parziali quando possibile.
 */
export async function researchDeep(
  query: string,
  opts: { maxSources?: number; depth?: number } = {},
): Promise<ResearchResult> {
  const q = String(query ?? "").trim();
  if (!q) return { ok: false, via: VIA, error: "research.deep vuole {query}" };
  const maxSources = Math.max(1, Math.min(opts.maxSources ?? 6, 10));
  const depth = Math.max(1, Math.min(opts.depth ?? 3, 5));

  const s = await websearch.search(q, { maxResults: maxSources });
  if (!s.ok || !s.results.length) {
    return { ok: false, via: VIA, error: `ricerca fallita: ${s.error ?? "nessuna fonte"}` };
  }
  const sources: ResearchSource[] = [];
  const texts: string[] = [];
  for (const h of s.results.slice(0, depth)) {
    try {
      const p = await web.fetch(h.url);
      const text = p.ok && p.page ? `${p.page.title}\n${p.page.text}`.slice(0, 1500) : h.snippet;
      sources.push({ title: h.title, url: h.url, excerpt: text.slice(0, 400) });
      if (text.trim()) texts.push(text);
    } catch {
      sources.push({ title: h.title, url: h.url, excerpt: h.snippet });
    }
  }
  if (!sources.length) return { ok: false, via: VIA, error: "nessuna fonte leggibile" };

  const context = sources.map((x, i) => `[${i + 1}] ${x.title} (${x.url})\n${x.excerpt}`).join("\n\n").slice(0, 4000);
  let synthesis: string;
  try {
    synthesis = (await llmChat(
      "Sei un ricercatore: sintetizza le fonti in 5-8 righe, citi i numeri [n], niente invenzioni.",
      `Domanda: ${q}\nFonti:\n${context}`,
      600,
    )) ?? "";
  } catch {
    synthesis = "";
  }
  if (!synthesis.trim()) synthesis = extractive(texts, q);

  const date = new Date().toISOString().slice(0, 10);
  const markdown = [
    `# Ricerca: ${q}`,
    `_${date} — ${sources.length} fonti_`,
    "",
    "## Sintesi",
    synthesis,
    "",
    "## Fonti",
    ...sources.map((x, i) => `${i + 1}. [${x.title}](${x.url})`),
  ].join("\n");
  let file: string | undefined;
  try {
    file = saveNote(`ricerca-${q.toLowerCase().replace(/[^a-z0-9à-öø-ÿ]+/gi, "-").slice(0, 40)}`, markdown);
  } catch { /* archivio best-effort */ }
  return { ok: true, via: VIA, report: { query: q, date, sources, synthesis, markdown, file } };
}

export const research = { deep: researchDeep };
