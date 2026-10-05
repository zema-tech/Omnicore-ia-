// Omnicore mind — LLM provider unificato (zero dipendenze, fetch nativo).
// 1. OpenAI-compatible (OMNICORE_LLM_BASE_URL), 2. Ollama nativo, 3. null -> euristica.
export interface LlmStatus { openai_compat: boolean; model: string; ollama_host: string }

export function llmConfig() {
  return {
    baseUrl: (process.env["OMNICORE_LLM_BASE_URL"] ?? "").replace(/\/$/, ""),
    apiKey: process.env["OMNICORE_LLM_API_KEY"] ?? "",
    model: process.env["OMNICORE_LLM_MODEL"] ?? "omnicore-fusion",
    timeoutMs: Number(process.env["OMNICORE_LLM_TIMEOUT"] ?? "30000"),
    ollama: (process.env["OLLAMA_HOST"] ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
  };
}

export function llmStatus(): LlmStatus {
  const c = llmConfig();
  return { openai_compat: !!c.baseUrl, model: c.baseUrl ? c.model : "", ollama_host: c.ollama };
}

async function postJson(url: string, payload: unknown, headers: Record<string, string> = {}, timeoutMs = 30000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(payload), signal: ctl.signal });
    if (!r.ok) throw new Error(`http ${r.status}`);
    return r.json();
  } finally { clearTimeout(t); }
}

/** Testo risposta LLM o null se nessun backend raggiungibile. Mai throw oltre null. */
export async function llmChat(system: string, user: string, maxTokens = 800): Promise<string | null> {
  const c = llmConfig();
  if (c.baseUrl) {
    try {
      const h: Record<string, string> = c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {};
      const res = await postJson(`${c.baseUrl}/chat/completions`,
        { model: c.model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature: 0.6 },
        h, c.timeoutMs);
      const txt = res?.choices?.[0]?.message?.content?.trim();
      if (txt) return txt;
    } catch { /* fallback ollama */ }
  }
  try {
    const res = await postJson(`${c.ollama}/api/generate`,
      { model: process.env["OMNICORE_LLM_MODEL"] ?? "llama3.1", prompt: `${system}\n\nUtente: ${user}\nOmnicore:`, stream: false },
      {}, c.timeoutMs);
    const txt = String(res?.response ?? "").trim();
    if (txt) return txt;
  } catch { /* nessun backend */ }
  return null;
}
