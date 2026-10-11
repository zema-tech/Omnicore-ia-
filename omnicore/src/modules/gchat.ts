// Modulo GCHAT — Google Chat via webhook in arrivo (semplice POST, niente
// OAuth: basta l'URL webhook dello spazio). Ricezione vera richiede app
// Workspace (documentato, non implementato). Zero dipendenze. Mai throw.
export interface GchatResult<T> { ok: boolean; via: string; data?: T; error?: string }

const VIA = "gchat(webhook)";

function hook(argsUrl?: string): string {
  return (argsUrl ?? process.env["GCHAT_WEBHOOK_URL"] ?? "").trim();
}

/** Invia testo allo spazio (webhook da args o env). */
export async function gchatSend(text: string, webhookUrl?: string): Promise<GchatResult<{ posted: boolean }>> {
  const url = hook(webhookUrl);
  if (!url) return { ok: false, via: VIA, error: "GCHAT_WEBHOOK_URL non impostato (Spazio → App e integrazioni → Webhook)" };
  // Produzione = https (Google). http solo verso localhost (test).
  if (!/^https:\/\//.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)([:/]|$)/.test(url)) {
    return { ok: false, via: VIA, error: "webhook deve essere https" };
  }
  if (!String(text ?? "").trim()) return { ok: false, via: VIA, error: "testo vuoto" };
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), Number(process.env["OMNICORE_GCHAT_TIMEOUT_MS"] ?? "15000"));
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: String(text).slice(0, 4000) }),
        signal: ctl.signal,
      });
      if (!r.ok) throw new Error(`gchat http ${r.status}`);
      return { ok: true, via: VIA, data: { posted: true } };
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

export const gchat = { send: gchatSend };
