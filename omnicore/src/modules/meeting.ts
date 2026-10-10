// Modulo MEETING — note riunioni live (stile OpenClaw live-notes, senza audio/STT:
// i segmenti arrivano da input manuale o hook futuri; la cattura microfonica
// richiede dipendenze esterne). Sessioni su data/meetings.json, finali in vault.
// Rileva action item (TODO/ACTION/deciso). Zero dipendenze. Mai throw critico.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { saveNote } from "../vault/notes.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIA = "meeting(native)";

export interface Segment { ts: number; who: string; text: string; action: boolean }
export interface Meeting { id: string; title: string; participants: string[]; segments: Segment[]; status: "open" | "closed"; created: number; updated: number }

export function meetingsFile(): string {
  return process.env["OMNICORE_MEETINGS_FILE"] ?? join(HERE, "..", "..", "data", "meetings.json");
}

function loadAll(): Record<string, Meeting> {
  try {
    const d = JSON.parse(readFileSync(meetingsFile(), "utf8"));
    return d?.meetings && typeof d.meetings === "object" ? d.meetings : {};
  } catch {
    return {};
  }
}

function saveAll(m: Record<string, Meeting>): void {
  const f = meetingsFile();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ meetings: m }, null, 2));
}

const ACTION_RE = /\b(action|todo|da fare|deciso|decisione|assegnato a|entro (il|lun|mar|mer|gio|ven))\b/i;

/** Apre una riunione. Throw se titolo vuoto. */
export function meetingStart(title: string, participants: string[] = []): { id: string } {
  const t = String(title ?? "").trim();
  if (!t) throw new Error("meeting.start vuole {title}");
  const all = loadAll();
  const id = `mtg-${Date.now().toString(36)}`;
  all[id] = {
    id, title: t.slice(0, 120),
    participants: participants.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 20),
    segments: [], status: "open", created: Date.now(), updated: Date.now(),
  };
  saveAll(all);
  return { id };
}

/** Aggiunge un segmento live. Throw se riunione assente/chiusa. */
export function meetingAppend(id: string, who: string, text: string): { action: boolean; count: number } {
  const all = loadAll();
  const m = all[String(id)];
  if (!m) throw new Error(`riunione non trovata: ${id}`);
  if (m.status !== "open") throw new Error(`riunione chiusa: ${id}`);
  const t = String(text ?? "").trim();
  if (!t) throw new Error("testo vuoto");
  const seg: Segment = { ts: Date.now(), who: String(who ?? "?").trim().slice(0, 40) || "?", text: t.slice(0, 1000), action: ACTION_RE.test(t) };
  m.segments.push(seg);
  m.updated = Date.now();
  const whoTrim = seg.who;
  if (whoTrim !== "?" && !m.participants.includes(whoTrim)) m.participants.push(whoTrim);
  saveAll(all);
  return { action: seg.action, count: m.segments.length };
}

function renderMarkdown(m: Meeting): string {
  const t0 = m.created;
  const clock = (ts: number) => {
    const s = Math.max(0, Math.round((ts - t0) / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
  const actions = m.segments.filter((s) => s.action);
  return [
    `# ${m.title}`,
    `_${new Date(m.created).toISOString().slice(0, 10)} — partecipanti: ${m.participants.join(", ") || "?"}_`,
    "",
    "## Timeline",
    ...m.segments.map((s) => `- **[${clock(s.ts)}] ${s.who}**: ${s.text}`),
    "",
    "## Action item",
    ...(actions.length ? actions.map((s) => `- [ ] ${s.text} (${s.who})`) : ["- (nessuno rilevato)"]),
  ].join("\n");
}

/** Anteprima live senza chiudere. Throw se assente. */
export function meetingStatus(id: string): { id: string; markdown: string } {
  const m = loadAll()[String(id)];
  if (!m) throw new Error(`riunione non trovata: ${id}`);
  return { id: m.id, markdown: renderMarkdown(m) };
}

/** Chiude e archivia nel vault. Throw se assente/già chiusa. */
export function meetingEnd(id: string): { id: string; file: string; markdown: string } {
  const all = loadAll();
  const m = all[String(id)];
  if (!m) throw new Error(`riunione non trovata: ${id}`);
  if (m.status !== "open") throw new Error(`riunione già chiusa: ${id}`);
  m.status = "closed";
  m.updated = Date.now();
  saveAll(all);
  const markdown = renderMarkdown(m);
  let file = "";
  try {
    file = saveNote(`riunione-${m.title.toLowerCase().replace(/[^a-z0-9à-öø-ÿ]+/gi, "-").slice(0, 40)}`, markdown);
  } catch { /* archivio best-effort */ }
  return { id: m.id, file, markdown };
}

/** Riunioni aperte. Mai throw. */
export function meetingList(): { id: string; title: string; segments: number }[] {
  try {
    return Object.values(loadAll())
      .filter((m) => m.status === "open")
      .map((m) => ({ id: m.id, title: m.title, segments: m.segments.length }));
  } catch {
    return [];
  }
}

export const meeting = {
  file: meetingsFile, start: meetingStart, append: meetingAppend,
  status: meetingStatus, end: meetingEnd, list: meetingList,
};
