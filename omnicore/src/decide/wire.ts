// Decide — wire TypeSafe-compatibile (Jev e CLM parlano lo stesso formato).
// POST {base}/v1/systemone {state, questions} -> {answers, usage}.
// Question: choice {instructions, criteria:{opt:desc}} / score {instructions, criteria:[lv]}
//           / noul {instructions, criteria?}. Errori: 401 chiave, 422 forma, 502 embedder.
export interface ChoiceQ { kind: "choice"; instructions: string; criteria: Record<string, string> }
export interface ScoreQ { kind: "score"; instructions: string; criteria: string[] }
export interface NoulQ { kind: "noul"; instructions: string; criteria?: { yes: string; no: string } }
export type Question = ChoiceQ | ScoreQ | NoulQ;

export interface SystemOneAnswers {
  [id: string]: {
    choice?: string;
    probabilities?: Record<string, number>;
    score?: number;
    noul?: number;
    confidence?: number;
  };
}

function toWire(q: Question): Record<string, unknown> {
  if (q.kind === "choice") return { instructions: q.instructions, criteria: q.criteria };
  if (q.kind === "score") return { instructions: q.instructions, criteria: q.criteria };
  return { instructions: q.instructions, ...(q.criteria ? { criteria: q.criteria } : {}) };
}

/** Una chiamata systemone. Throw con motivo (401/422/rete) — il chiamante degrada. */
export async function systemOne(
  baseUrl: string,
  apiKey: string,
  state: string,
  questions: Record<string, Question>,
  opts: { model?: string; timeoutMs?: number } = {},
): Promise<SystemOneAnswers> {
  const timeoutMs = opts.timeoutMs ?? Number(process.env["OMNICORE_DECIDE_TIMEOUT"] ?? "15000");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const wire: Record<string, Record<string, unknown>> = {};
    for (const [id, q] of Object.entries(questions)) wire[id] = toWire(q);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const r = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/systemone`, {
      method: "POST",
      headers,
      body: JSON.stringify({ state, questions: wire, ...(opts.model ? { model: opts.model } : {}) }),
      signal: ctl.signal,
    });
    if (r.status === 401) throw new Error("decide 401: chiave API non valida");
    if (!r.ok) throw new Error(`decide http ${r.status}`);
    const data = (await r.json()) as { answers?: SystemOneAnswers };
    if (!data.answers || typeof data.answers !== "object") throw new Error("decide: risposta senza answers");
    return data.answers;
  } finally {
    clearTimeout(t);
  }
}
