// Modulo WHATSAPP — Cloud API via HTTPS (send) + parser webhook (receive).
// Niente Baileys/account reali: serve numero Business Meta. Invio:
// POST {base}/{phoneId}/messages {messaging_product, to, text}.
// Ricezione: verifica GET webhook + parse POST in inbound. Token solo env.
// Zero dipendenze. Mai throw.
export interface WaInbound { id: string; from: string; text: string }
export interface WaResult<T> { ok: boolean; via: string; data?: T; error?: string }

const VIA = "whatsapp(cloud-api)";

function apiBase(): string {
  return (process.env["WHATSAPP_API_BASE"] ?? "https://graph.facebook.com/v22.0").replace(/\/$/, "");
}

function token(): string {
  return process.env["WHATSAPP_TOKEN"] ?? "";
}

function phoneId(): string {
  return process.env["WHATSAPP_PHONE_ID"] ?? "";
}

function needConf(): string | null {
  if (!token()) return "WHATSAPP_TOKEN non impostato (Meta Developers → WhatsApp)";
  if (!phoneId()) return "WHATSAPP_PHONE_ID non impostato (id numero Business)";
  return null;
}

/** Invia testo (spezzato a 4000 char). */
export async function waSend(to: string, text: string): Promise<WaResult<{ parts: number }>> {
  const err = needConf();
  if (err) return { ok: false, via: VIA, error: err };
  const dest = String(to ?? "").replace(/[\s-]/g, "");
  if (!/^\+\d{6,15}$/.test(dest)) return { ok: false, via: VIA, error: `destinatario invalido (serve + prefisso): ${to}` };
  if (!String(text ?? "").trim()) return { ok: false, via: VIA, error: "testo vuoto" };
  try {
    let parts = 0;
    let rest = text;
    while (rest) {
      const piece = rest.length > 4000 ? rest.slice(0, 4000) : rest;
      rest = rest.length > 4000 ? rest.slice(4000) : "";
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), Number(process.env["OMNICORE_WA_TIMEOUT_MS"] ?? "15000"));
      try {
        const r = await fetch(`${apiBase()}/${phoneId()}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to: dest, type: "text", text: { body: piece } }),
          signal: ctl.signal,
        });
        const j = (await r.json().catch(() => null)) as any;
        if (!r.ok || j?.error) throw new Error(`whatsapp: ${String(j?.error?.message ?? `http ${r.status}`).slice(0, 160)}`);
        parts++;
      } finally {
        clearTimeout(t);
      }
    }
    return { ok: true, via: VIA, data: { parts } };
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

/** Verifica webhook GET di Meta (?hub.mode=subscribe...). Puro. */
export function waVerify(query: Record<string, string>): { challenge?: string } {
  const vt = process.env["WHATSAPP_VERIFY_TOKEN"] ?? "";
  if (query["hub.mode"] === "subscribe" && vt && query["hub.verify_token"] === vt && query["hub.challenge"]) {
    return { challenge: query["hub.challenge"] };
  }
  return {};
}

/** Estrae messaggi in arrivo dal payload webhook. Puro, testabile. */
export function waParse(body: any): WaInbound[] {
  const out: WaInbound[] = [];
  try {
    const entries = body?.entry ?? [];
    for (const e of Array.isArray(entries) ? entries : []) {
      for (const ch of e?.changes ?? []) {
        for (const m of ch?.value?.messages ?? []) {
          const text = String(m?.text?.body ?? "");
          if ((m?.type === "text" || text) && text) {
            out.push({ id: String(m.id ?? ""), from: String(m.from ?? ""), text: text.slice(0, 2000) });
          }
        }
      }
    }
  } catch { /* payload rotto: lista vuota */ }
  return out;
}

export const whatsapp = { send: waSend, verify: waVerify, parse: waParse };
