// Modulo COLLAB — collaborazione multi-utente (stile OpenClaw shared sessions).
// Presence: heartbeat data/presence.json (chi è online, su cosa).
// Share: ACL per sessione data/shares.json {owner, editors[], viewers[]} +
// check() per decidere (l'enforcement HTTP resta lavoro futuro: il server ha
// un solo Bearer, niente identità utente).
// Zero dipendenze. Mai throw critico (throw solo su input invalido).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export interface PresenceEntry { user: string; doing: string; lastSeen: number; stale: boolean }
export type Role = "owner" | "editor" | "viewer";

function presenceFile(): string {
  return process.env["OMNICORE_PRESENCE_FILE"] ?? join(HERE, "..", "..", "data", "presence.json");
}

function sharesFile(): string {
  return process.env["OMNICORE_SHARES_FILE"] ?? join(HERE, "..", "..", "data", "shares.json");
}

function loadJson(f: string): Record<string, any> {
  try {
    const d = JSON.parse(readFileSync(f, "utf8"));
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}

function saveJson(f: string, key: string, d: Record<string, any>): void {
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ [key]: d }, null, 2));
}

function cleanUser(u: string): string {
  const s = String(u ?? "").trim().slice(0, 40);
  if (!/^[A-Za-z0-9._-]+$/.test(s)) throw new Error(`utente invalido (a-z, 0-9, ._-): ${String(u).slice(0, 40)}`);
  return s;
}

/** Heartbeat presenza (upsert). Ritorna online count. */
export function presencePing(user: string, doing = ""): { user: string; online: number } {
  const u = cleanUser(user);
  const raw = loadJson(presenceFile()) as any;
  const all = (raw?.presence ?? raw) as Record<string, { doing: string; lastSeen: number }>;
  const map: Record<string, { doing: string; lastSeen: number }> = all && typeof all === "object" ? all : {};
  // pota oltre 1h
  for (const [k, v] of Object.entries(map)) {
    if (Date.now() - (v?.lastSeen ?? 0) > 3600_000) delete map[k];
  }
  map[u] = { doing: String(doing ?? "").slice(0, 120), lastSeen: Date.now() };
  saveJson(presenceFile(), "presence", map as Record<string, any>);
  return { user: u, online: Object.keys(map).length };
}

/** Chi è online (stale oltre 120s). Mai throw. */
export function presenceList(): PresenceEntry[] {
  try {
    const raw = loadJson(presenceFile());
    const all = (raw?.presence ?? raw) as Record<string, { doing: string; lastSeen: number }>;
    if (!all || typeof all !== "object") return [];
    return Object.entries(all)
      .filter(([, v]) => v && typeof v.lastSeen === "number")
      .map(([user, v]) => ({ user, doing: String(v.doing ?? ""), lastSeen: v.lastSeen, stale: Date.now() - v.lastSeen > 120_000 }))
      .sort((a, b) => b.lastSeen - a.lastSeen);
  } catch {
    return [];
  }
}

interface Acl { owner: string; editors: string[]; viewers: string[] }

function loadShares(): Record<string, Acl> {
  const raw = loadJson(sharesFile());
  const all = (raw?.shares ?? raw) as Record<string, Acl>;
  return all && typeof all === "object" ? all : {};
}

function saveShares(all: Record<string, Acl>): void {
  saveJson(sharesFile(), "shares", all as Record<string, any>);
}

/**
 * Concede ruolo su sessione. Il primo grant senza owner diventa owner.
 * Solo l'owner cambia ruoli altrui. Throw se invalido.
 */
export function shareGrant(session: string, user: string, role: string, by = ""): { session: string; user: string; role: Role } {
  const sid = String(session ?? "").trim();
  if (!sid) throw new Error("share.grant vuole {session}");
  const u = cleanUser(user);
  if (role !== "owner" && role !== "editor" && role !== "viewer") {
    throw new Error(`ruolo invalido (owner|editor|viewer): ${role}`);
  }
  const all = loadShares();
  const acl: Acl = all[sid] ?? { owner: "", editors: [], viewers: [] };
  if (!acl.owner) {
    // prima concessione: owner (ignora by)
    acl.owner = u;
    if (role === "editor" && !acl.editors.includes(u)) acl.editors.push(u);
    if (role === "viewer" && !acl.viewers.includes(u)) acl.viewers.push(u);
  } else {
    if (by && by !== acl.owner) throw new Error(`solo ${acl.owner} (owner) cambia i ruoli`);
    if (role === "owner") {
      if (!acl.editors.includes(acl.owner)) acl.editors.push(acl.owner);
      acl.owner = u;
    } else {
      acl.editors = acl.editors.filter((x) => x !== u);
      acl.viewers = acl.viewers.filter((x) => x !== u);
      if (role === "editor") acl.editors.push(u);
      else acl.viewers.push(u);
    }
  }
  all[sid] = acl;
  saveShares(all);
  return { session: sid, user: u, role };
}

/** Ruolo di un utente su sessione (none se niente). Mai throw. */
export function shareCheck(session: string, user: string): { role: Role | "none" } {
  try {
    const acl = loadShares()[String(session)];
    if (!acl) return { role: "none" };
    const u = String(user ?? "").trim();
    if (u && u === acl.owner) return { role: "owner" };
    if (u && acl.editors.includes(u)) return { role: "editor" };
    if (u && acl.viewers.includes(u)) return { role: "viewer" };
    return { role: "none" };
  } catch {
    return { role: "none" };
  }
}

/** Revoca (solo owner). Throw se invalido. */
export function shareRevoke(session: string, user: string, by: string): { revoked: string } {
  const all = loadShares();
  const acl = all[String(session)];
  if (!acl) throw new Error(`condivisione assente: ${session}`);
  if (by !== acl.owner) throw new Error(`solo ${acl.owner} (owner) revoca`);
  const u = cleanUser(user);
  if (u === acl.owner) throw new Error("l'owner non si revoca da solo (trasferisci prima)");
  acl.editors = acl.editors.filter((x) => x !== u);
  acl.viewers = acl.viewers.filter((x) => x !== u);
  saveShares(all);
  return { revoked: u };
}

export const collab = {
  ping: presencePing, online: presenceList,
  grant: shareGrant, check: shareCheck, revoke: shareRevoke,
};
