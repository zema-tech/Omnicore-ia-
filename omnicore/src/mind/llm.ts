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
  // env vince su omnicore.config.json, che vince sui default (dentro loadConfig).
  // La key resta SOLO env (mai nel json). loadConfig non lancia mai.
  const j = loadConfig();
  return {
    provider: j.llmProvider,
    baseUrl: j.llmBaseUrl.replace(/\/$/, ""),
    apiKey: process.env["OMNICORE_LLM_API_KEY"] ?? "",
    model: j.llmModel,
    localModel: j.llmLocalModel,
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

/** Chat streaming (SSE OpenAI-compatibile): token via onToken, fallback non-stream. Mai throw oltre null. */
export async function llmChatStream(
  system: string,
  user: string,
  maxTokens = 800,
  onToken: (t: string) => void = () => {},
): Promise<{ text: string; via: LlmProvider; streamed: boolean } | null> {
  const c = llmConfig();
  if (c.provider !== "local" && c.baseUrl) {
    try {
      const h: Record<string, string> = c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {};
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), c.timeoutMs * 2);
      try {
        const r = await fetch(`${c.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...h },
          body: JSON.stringify({ model: c.model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature: 0.6, stream: true }),
          signal: ctl.signal,
        });
        if (!r.ok || !r.body) throw new Error(`http ${r.status}`);
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const s = line.trim();
            if (!s.startsWith("data:")) continue;
            const payload = s.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload);
              const piece = j?.choices?.[0]?.delta?.content ?? j?.choices?.[0]?.message?.content ?? "";
              if (piece) {
                text += piece;
                try {
                  onToken(piece);
                } catch { /* callback mai fatale */ }
              }
            } catch { /* chunk parziale: ignora */ }
          }
        }
        try {
          await reader.cancel();
        } catch { /* chiusura best-effort */ }
        if (text.trim()) return { text, via: "api", streamed: true };
      } finally {
        clearTimeout(t);
      }
    } catch { /* fallback sotto */ }
  }
  const plain = await llmChatVia(system, user, maxTokens);
  return plain ? { ...plain, streamed: false } : null;
}

/** Testo risposta LLM o null se nessun backend raggiungibile. Mai throw oltre null. */
export async function llmChat(system: string, user: string, maxTokens = 800): Promise<string | null> {
  const r = await llmChatVia(system, user, maxTokens);
  return r?.text ?? null;
}

export interface DoctorBackend {
  ok: boolean;
  ms: number;
  model?: string;
  detail: string;
}

export interface DoctorResult {
  provider: LlmProvider;
  api: DoctorBackend;
  local: DoctorBackend;
  /** Backend che il loop userebbe ora (stessa catena di llmChatVia). */
  active: "api" | "local" | "euristica";
}

/** Verifica quale cervello risponde: prova api e local con un ping. Mai throw. */
export async function llmDoctor(): Promise<DoctorResult> {
  const c = llmConfig();
  const ping = async (kind: "api" | "local"): Promise<DoctorBackend> => {
    const t0 = Date.now();
    try {
      const txt = kind === "api" ? await chatApi("Sei un test di connessione.", "Rispondi solo: ok", 10) : await chatLocal("Sei un test di connessione.", "Rispondi solo: ok", 10);
      if (!txt) throw new Error("nessuna risposta");
      return { ok: true, ms: Date.now() - t0, model: kind === "api" ? c.model : c.localModel, detail: txt.slice(0, 80) };
    } catch (e) {
      const hint = kind === "api"
        ? (!c.baseUrl ? "OMNICORE_LLM_BASE_URL non impostato" : String(e).slice(0, 120))
        : `ollama non raggiungibile (${c.ollama})`;
      return { ok: false, ms: Date.now() - t0, detail: hint };
    }
  };
  const [api, local] = [await ping("api"), await ping("local")];
  const active = c.provider === "local" ? (local.ok ? "local" as const : "euristica" as const) : api.ok ? "api" as const : local.ok ? "local" as const : "euristica" as const;
  return { provider: c.provider, api, local, active };
}
