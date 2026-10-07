// Modulo SESSIONI — conversazioni native di Omnicore
// (modellato su Hermes sessions/ + state.db: conversazioni con messaggi,
// persistite in data/sessions.json — STESSO file letto dal server e da mind).
// Chi scrive qui: il loop (turni), chi legge: memoria e dashboard. Zero dipendenze.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface SessionMessage {
  ts: number;
  text: string;
  intent?: string;
  handler?: string;
  ok?: boolean;
  answer?: string;
  summary?: string;
  [k: string]: unknown;
}

export interface Session {
  id: string;
  created: number;
  messages: SessionMessage[];
}

const HERE = dirname(fileURLToPath(import.meta.url));

export function sessionsFile(): string {
  return process.env["OMNICORE_SESSIONS_FILE"] ?? join(HERE, "..", "..", "data", "sessions.json");
}

function loadAll(): Record<string, Session> {
  try {
    const d = JSON.parse(readFileSync(sessionsFile(), "utf8"));
    return d?.sessions && typeof d.sessions === "object" ? d.sessions : {};
  } catch {
    return {};
  }
}

function saveAll(sessions: Record<string, Session>): void {
  const f = sessionsFile();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ sessions }, null, 2));
}

/** Crea una sessione e ritorna l'id. */
export function createSession(): string {
  const sessions = loadAll();
  const id = `s${Date.now()}`;
  sessions[id] = { id, created: Date.now() / 1000, messages: [] };
  saveAll(sessions);
  return id;
}

/** Aggiunge un messaggio (crea la sessione se id assente). Ritorna l'id usato. */
export function logMessage(sessionId: string | null, entry: Omit<SessionMessage, "ts">): string {
  const sessions = loadAll();
  let id = sessionId && sessions[sessionId] ? sessionId : `s${Date.now()}`;
  if (!sessions[id]) sessions[id] = { id, created: Date.now() / 1000, messages: [] };
  const msg = { ts: Date.now() / 1000, text: entry.text, ...entry } as SessionMessage;
  (sessions[id] as Session).messages.push(msg);
  saveAll(sessions);
  return id;
}

/** Ultimi N messaggi di una sessione (o [] se assente). */
export function readMessages(sessionId: string, limit = 50): SessionMessage[] {
  const s = loadAll()[sessionId];
  return s ? s.messages.slice(-limit) : [];
}

/** Elenco sessioni con anteprima. */
export function listSessions(): { id: string; created: number; count: number; last: string }[] {
  return Object.values(loadAll())
    .sort((a, b) => a.created - b.created)
    .map((s) => ({
      id: s.id,
      created: s.created,
      count: s.messages.length,
      last: s.messages.length ? String(s.messages[s.messages.length - 1].text ?? "").slice(0, 80) : "",
    }));
}

/** Storia recente trasversale (contesto breve per la memoria). */
export function recentAcross(limit = 8): SessionMessage[] {
  const out: SessionMessage[] = [];
  for (const s of Object.values(loadAll())) out.push(...s.messages.slice(-3));
  return out.slice(-limit);
}

export const sessions = {
  file: sessionsFile,
  create: createSession,
  log: logMessage,
  read: readMessages,
  list: listSessions,
  recent: recentAcross,
};
