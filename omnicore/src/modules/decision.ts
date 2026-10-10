// Modulo DECISION — modelli decisionali deterministici (TypeSafe nello spirito:
// input tipizzati, output verificabile, zero LLM). Pesi normalizzati, score 0-10,
// criteri lower-better invertiti. Tool decision.evaluate. Mai throw: {ok,...}.
export interface Criterion { name: string; weight: number; lowerBetter?: boolean }
export interface Model { name: string; description: string; criteria: Criterion[] }
export interface Option { name: string; scores: Record<string, number> }
export interface Ranked { name: string; total: number; parts: Record<string, number> }

const VIA = "decide(models)";

const BUILTINS: Model[] = [
  {
    name: "budget",
    description: "Scegli spesa: poco costo, molto impatto, un po' di urgenza",
    criteria: [
      { name: "costo", weight: 0.4, lowerBetter: true },
      { name: "impatto", weight: 0.4 },
      { name: "urgenza", weight: 0.2 },
    ],
  },
  {
    name: "priority",
    description: "Ordina task: impatto e urgenza contano, lo sforzo frena",
    criteria: [
      { name: "impatto", weight: 0.4 },
      { name: "urgenza", weight: 0.3 },
      { name: "sforzo", weight: 0.3, lowerBetter: true },
    ],
  },
];

/** Modelli disponibili (built-in). */
export function listModels(): Model[] {
  return BUILTINS.map((m) => ({ ...m, criteria: m.criteria.map((c) => ({ ...c })) }));
}

function normCriteria(model: Model | undefined, custom?: Criterion[]): { criteria: Criterion[]; error?: string } {
  const raw = custom?.length ? custom : model?.criteria ?? [];
  const cs = raw
    .filter((c) => c && typeof c.name === "string" && c.name.trim())
    .map((c) => ({ name: c.name.trim().toLowerCase(), weight: Number(c.weight), lowerBetter: c.lowerBetter === true }))
    .filter((c) => Number.isFinite(c.weight) && c.weight > 0)
    .slice(0, 10);
  if (!cs.length) return { criteria: [], error: "servono criteri con peso > 0" };
  const sum = cs.reduce((n, c) => n + c.weight, 0);
  return { criteria: cs.map((c) => ({ ...c, weight: c.weight / sum })) };
}

/**
 * Valuta opzioni con somma pesata. Score 0-10 per criterio (mancante = 5).
 * Ritorna ranking + raccomandazione + report. Mai throw.
 */
export function evaluateDecision(input: {
  model?: string;
  criteria?: Criterion[];
  options?: Option[];
}): { ok: boolean; via: string; ranking?: Ranked[]; winner?: string; report?: string; error?: string } {
  const model = typeof input.model === "string" && input.model
    ? BUILTINS.find((m) => m.name === input.model)
    : undefined;
  if (typeof input.model === "string" && input.model && !model) {
    return { ok: false, via: VIA, error: `modello ignoto: ${input.model} (${BUILTINS.map((m) => m.name).join(", ")})` };
  }
  const { criteria, error } = normCriteria(model, input.criteria);
  if (error) return { ok: false, via: VIA, error };
  const opts = (Array.isArray(input.options) ? input.options : []).slice(0, 20);
  if (opts.length < 2) return { ok: false, via: VIA, error: "servono almeno 2 opzioni {name, scores}" };
  for (const o of opts) {
    if (!o || typeof o.name !== "string" || !o.name.trim()) return { ok: false, via: VIA, error: "ogni opzione vuole {name, scores}" };
  }
  const ranking: Ranked[] = opts.map((o) => {
    const parts: Record<string, number> = {};
    let total = 0;
    for (const c of criteria) {
      const raw = Number(o.scores?.[c.name]);
      const v = Number.isFinite(raw) ? Math.max(0, Math.min(10, raw)) : 5;
      const eff = c.lowerBetter ? 10 - v : v;
      parts[c.name] = Math.round(eff * c.weight * 100) / 100;
      total += eff * c.weight;
    }
    return { name: o.name.trim(), total: Math.round(total * 100) / 100, parts };
  }).sort((a, b) => b.total - a.total);
  const winner = ranking[0].name;
  const critLine = criteria.map((c) => `${c.name}×${Math.round(c.weight * 100)}%${c.lowerBetter ? "(meno=meglio)" : ""}`).join(", ");
  const report = [
    `Decisione (${model ? `modello ${model.name}` : "criteri custom"}): ${critLine}`,
    ...ranking.map((r, i) => `${i + 1}. ${r.name} — ${r.total}/10 (${Object.entries(r.parts).map(([k, v]) => `${k}:${v}`).join(", ")})`),
    `Raccomandazione: ${winner}`,
  ].join("\n");
  return { ok: true, via: VIA, ranking, winner, report };
}

export const decision = { models: listModels, evaluate: evaluateDecision };
