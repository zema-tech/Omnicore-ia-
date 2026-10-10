// Modulo CANALI — presenza nativa di Omnicore (modellato su OpenClaw:
// channels/ + extensions telegram/whatsapp/discord/slack come backend).
//
// Channel = {id, kind, status(), send()}. Backend reali: console (log),
// webhook (POST JSON), telegram (Bot API), discord (Bot REST + Gateway),
// slack (Web API). whatsapp resta needsConfig onesto. Zero dipendenze.
import { telegram } from "./telegram.ts";
import { discord } from "./discord.ts";
import { slack } from "./slack.ts";
import { whatsapp } from "./whatsapp.ts";
import { signal } from "./signal.ts";
import { email } from "./email.ts";
export type ChannelKind = "console" | "webhook" | "telegram" | "whatsapp" | "discord" | "slack" | "email" | "signal";

export interface ChannelDef {
  id: string;
  kind: ChannelKind;
  label?: string;
  url?: string; // webhook
}

export interface ChannelStatus {
  id: string;
  kind: ChannelKind;
  ok: boolean;
  detail: string;
}

function env(name: string): string {
  return process.env[name] ?? "";
}

/** Canali configurati: console sempre + webhook se OMNICORE_WEBHOOK_URL. */
export function listChannels(): ChannelDef[] {
  const out: ChannelDef[] = [{ id: "console", kind: "console", label: "log locale" }];
  if (env("OMNICORE_WEBHOOK_URL")) {
    out.push({ id: "webhook", kind: "webhook", url: env("OMNICORE_WEBHOOK_URL") });
  }
  if (env("TELEGRAM_BOT_TOKEN")) out.push({ id: "telegram", kind: "telegram" });
  if (env("WHATSAPP_TOKEN")) out.push({ id: "whatsapp", kind: "whatsapp" });
  if (env("DISCORD_BOT_TOKEN")) out.push({ id: "discord", kind: "discord" });
  if (env("SLACK_BOT_TOKEN")) out.push({ id: "slack", kind: "slack" });
  if (env("SMTP_HOST") || env("IMAP_HOST")) out.push({ id: "email", kind: "email" });
  if (env("SIGNAL_NUMBER")) out.push({ id: "signal", kind: "signal" });
  return out;
}

export function channelStatus(): ChannelStatus[] {
  return listChannels().map((c) => {
    if (c.kind === "console") return { id: c.id, kind: c.kind, ok: true, detail: "log locale attivo" };
    if (c.kind === "webhook") return { id: c.id, kind: c.kind, ok: true, detail: `POST ${c.url}` };
    if (c.kind === "telegram") return { id: c.id, kind: c.kind, ok: true, detail: "bot configurato (verifica con telegram.me, leggi con telegram.poll)" };
    if (c.kind === "discord") return { id: c.id, kind: c.kind, ok: true, detail: "bot configurato (invio discord.send, lettura discord.listen)" };
    if (c.kind === "slack") return { id: c.id, kind: c.kind, ok: true, detail: "bot configurato (invio slack.send)" };
    if (c.kind === "whatsapp") return { id: c.id, kind: c.kind, ok: true, detail: "business api configurata (invio whatsapp.send)" };
    if (c.kind === "email") return { id: c.id, kind: c.kind, ok: true, detail: "smtp/imap configurati (invio email.send, lettura email.read)" };
    if (c.kind === "signal") return { id: c.id, kind: c.kind, ok: true, detail: "signal-cli configurato (invio signal.send, lettura signal.poll)" };
    return { id: c.id, kind: c.kind, ok: false, detail: `${c.kind}: backend non collegato (serve token/adapter dedicato)` };
  });
}

/** Invio nativo. Ritorna {ok, via, detail}. Mai throw. */
export async function channelSend(message: string, targets: string[] = []): Promise<{ ok: boolean; via: string; detail: string }> {
  const chans = listChannels();
  // chat_id numerici attivano il backend telegram anche senza id "telegram"
  const withTg = targets.some((t) => /^-?\d+$/.test(t)) && !targets.includes("telegram")
    ? [...targets, "telegram"]
    : targets;
  const wanted = withTg.length ? chans.filter((c) => withTg.includes(c.id)) : chans.filter((c) => c.kind === "console");
  if (!wanted.length) {
    return { ok: false, via: "channel", detail: `nessun canale tra: ${targets.join(",")}` };
  }
  const results: string[] = [];
  let allOk = true;
  for (const c of wanted) {
    if (c.kind === "console") {
      console.log(`[omnicore:${c.id}] ${message}`);
      results.push(`${c.id}: loggato`);
      continue;
    }
    if (c.kind === "webhook" && c.url) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 10000);
        try {
          const r = await fetch(c.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: message, from: "omnicore" }),
            signal: ctl.signal,
          });
          if (!r.ok) throw new Error(`http ${r.status}`);
          results.push(`${c.id}: consegnato`);
        } finally {
          clearTimeout(t);
        }
      } catch (e) {
        allOk = false;
        results.push(`${c.id}: fallito (${String(e).slice(0, 120)})`);
      }
      continue;
    }
    if (c.kind === "telegram") {
      // target = chat_id numerici (spazio o virgola); senza target: errore onesto.
      const ids = targets.filter((t) => t !== "telegram" && /^-?\d+$/.test(t));
      if (!ids.length) {
        allOk = false;
        results.push(`${c.id}: serve chat_id target (es. targets:["123456"])`);
        continue;
      }
      for (const id of ids) {
        const r = await telegram.send(Number(id), message);
        results.push(r.ok ? `${c.id}:${id}: consegnato` : `${c.id}:${id}: fallito (${r.error})`);
        if (!r.ok) allOk = false;
      }
      continue;
    }
    if (c.kind === "discord") {
      // target = channel id numerici + id "discord" esplicito.
      const ids = targets.filter((t) => t !== "discord" && /^\d+$/.test(t));
      if (!ids.length) {
        allOk = false;
        results.push(`${c.id}: serve channel id target (es. targets:["discord","123"])`);
        continue;
      }
      for (const id of ids) {
        const r = await discord.send(id, message);
        results.push(r.ok ? `${c.id}:${id}: consegnato` : `${c.id}:${id}: fallito (${r.error})`);
        if (!r.ok) allOk = false;
      }
      continue;
    }
    if (c.kind === "slack") {
      // target = channel id (C…/D…) + id "slack" esplicito.
      const ids = targets.filter((t) => t !== "slack" && /^[A-Za-z0-9_-]{3,}$/.test(t));
      if (!ids.length) {
        allOk = false;
        results.push(`${c.id}: serve channel target (es. targets:["slack","C123"])`);
        continue;
      }
      for (const id of ids) {
        const r = await slack.send(id, message);
        results.push(r.ok ? `${c.id}:${id}: consegnato` : `${c.id}:${id}: fallito (${r.error})`);
        if (!r.ok) allOk = false;
      }
      continue;
    }
    if (c.kind === "whatsapp") {
      // target = numeri con + (così non scattano come chat_id telegram) + id esplicito.
      const ids = targets.filter((t) => t !== "whatsapp" && /^\+?\d[\d\s-]{5,}$/.test(t) && /\+/.test(t));
      if (!ids.length) {
        allOk = false;
        results.push(`${c.id}: serve numero target con + (es. targets:["whatsapp","+39123"])`);
        continue;
      }
      for (const id of ids) {
        const r = await whatsapp.send(id, message);
        results.push(r.ok ? `${c.id}:${id}: consegnato` : `${c.id}:${id}: fallito (${r.error})`);
        if (!r.ok) allOk = false;
      }
      continue;
    }
    if (c.kind === "email") {
      // target = indirizzi email + id "email" esplicito.
      const ids = targets.filter((t) => t !== "email" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t));
      if (!ids.length) {
        allOk = false;
        results.push(`${c.id}: serve indirizzo target (es. targets:["email","a@b.it"])`);
        continue;
      }
      const subject = `Omnicore — ${new Date().toISOString().slice(0, 10)}`;
      for (const id of ids) {
        const r = await email.send(id, subject, message);
        results.push(r.ok ? `${c.id}:${id}: consegnato` : `${c.id}:${id}: fallito (${r.error})`);
        if (!r.ok) allOk = false;
      }
      continue;
    }
    if (c.kind === "signal") {
      // target = numeri con + (come whatsapp) + id "signal" esplicito.
      const ids = targets.filter((t) => t !== "signal" && /^\+\d[\d\s-]{5,}$/.test(t));
      if (!ids.length) {
        allOk = false;
        results.push(`${c.id}: serve numero target con + (es. targets:["signal","+39123"])`);
        continue;
      }
      for (const id of ids) {
        const r = await signal.send(id, message);
        results.push(r.ok ? `${c.id}:${id}: consegnato` : `${c.id}:${id}: fallito (${r.error})`);
        if (!r.ok) allOk = false;
      }
      continue;
    }
    allOk = false;
    results.push(`${c.id}: non collegato (backend ${c.kind} da implementare)`);
  }
  return { ok: allOk, via: "channel(native)", detail: results.join(" | ") };
}

export const channels = { list: listChannels, status: channelStatus, send: channelSend };
