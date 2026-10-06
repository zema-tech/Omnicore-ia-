// Omnicore mind — interfaccia LLM unificata (zero dipendenze, fetch nativo).
//
// Due provider, scelta via config (env vince su omnicore.config.json):
//   - "api"   (default, consigliato): OpenAI-compatible via OMNICORE_LLM_BASE_URL
//     + OMNICORE_LLM_API_KEY (solo env, MAI nel json). Es: OpenRouter, LM Studio.
//   - "local": Ollama nativo via OLLAMA_HOST + OMNICORE_LLM_LOCAL_MODEL.
// Catena: con provider "api" si prova api e poi local come ultima spiaggia;
// con provider "local" mai chiamate cloud. Senza backend: null -> euristica.
export type LlmProvider = "api" | "local";

export interface LlmStatus {
  provider: LlmProvider;
  openai_compat: boolean;
  model: string;
  ollama_host: string;
  local_model: string;
}

import { loadConfig } from "../config.ts";

export function llmConfig() {
  let jsonProvider: string | undefined;
  let jsonLocalModel: string | undefined;
  try {
    const j = loadConfig();
    jsonProvider = j.llmProvider;
    jsonLocalModel = j.llmLocalModel;
  } catch {
    /* config assente: solo env */
  }
  const provider: LlmProvider = (process.env["OMNICORE_LLM_PROVIDER"] ?? jsonProvider ?? "api") === "local" ? "local" : "api";
  return {
    provider,
    baseUrl: (process.env["OMNICORE_LLM_BASE_URL"] ?? "").replace(/\/$/, ""),
    apiKey: process.env["OMNICORE_LLM_API_KEY"] ?? "",
    model: process.env["OMNICORE_LLM_MODEL"] ?? "omnicore-fusion",
    localModel: process.env["OMNICORE_LLM_LOCAL_MODEL"] ?? jsonLocalModel ?? "llama3.1",
    timeoutMs: Number(process.env["OMNICORE_LLM_TIMEOUT"] ?? "30000"),
    ollama: (process.env["OLLAMA_HOST"] ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
  };
}

export function llmStatus(): LlmStatus {
  const c = llmConfig();
  return {
    provider: c.provider,
    openai_compat: !!c.baseUrl,
    model: c.baseUrl ? c.model : "",
    ollama_host: c.ollama,
    local_model: c.localModel,
  };
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

async function chatApi(system: string, user: string, maxTokens: number): Promise<string | null> {
  const c = llmConfig();
  if (!c.baseUrl) return null;
  try {
    const h: Record<string, string> = c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {};
    const res = await postJson(`${c.baseUrl}/chat/completions`,
      { model: c.model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature: 0.6 },
      h, c.timeoutMs);
    const txt = res?.choices?.[0]?.message?.content?.trim();
    return txt || null;
  } catch {
    return null;
  }
}

async function chatLocal(system: string, user: string, maxTokens: number): Promise<string | null> {
  const c = llmConfig();
  void maxTokens;
  try {
    const res = await postJson(`${c.ollama}/api/generate`,
      { model: c.localModel, prompt: `${system}\n\nUtente: ${user}\nOmnicore:`, stream: false },
      {}, c.timeoutMs);
    const txt = String(res?.response ?? "").trim();
    return txt || null;
  } catch {
    return null;
  }
}

/** Chat via catena provider. Ritorna {text, via} o null. Mai throw. */
export async function llmChatVia(system: string, user: string, maxTokens = 800): Promise<{ text: string; via: LlmProvider } | null> {
  const c = llmConfig();
  const chain: LlmProvider[] = c.provider === "local" ? ["local"] : ["api", "local"];
  for (const p of chain) {
    const txt = p === "api" ? await chatApi(system, user, maxTokens) : await chatLocal(system, user, maxTokens);
    if (txt) return { text: txt, via: p };
  }
  return null;
}

/** Testo risposta LLM o null se nessun backend raggiungibile. Mai throw oltre null. */
export async function llmChat(system: string, user: string, maxTokens = 800): Promise<string | null> {
  const r = await llmChatVia(system, user, maxTokens);
  return r?.text ?? null;
}
