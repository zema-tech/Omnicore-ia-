// Modulo PERMESSI — approval flow nativo di Omnicore
// (modellato su Hermes permissions_list_open/permissions_respond +
// acp edit_approval.py: azioni sensibili in attesa, qualcuna le approva).
// Store in data/approvals.json. Zero dipendenze.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type ApprovalStatus = "open" | "allowed" | "denied";

export interface Approval {
  id: string;
  action: string;
  target: string;
  reason: string;
  status: ApprovalStatus;
  created: number;
  decided?: number;
}

const HERE = dirname(fileURLToPath(import.meta.url));
let seq = 0;

export function approvalsFile(): string {
  return process.env["OMNICORE_APPROVALS_FILE"] ?? join(HERE, "..", "..", "data", "approvals.json");
}

function load(): Approval[] {
  try {
    const d = JSON.parse(readFileSync(approvalsFile(), "utf8"));
    return Array.isArray(d?.approvals) ? d.approvals : [];
  } catch {
    return [];
  }
}

function save(approvals: Approval[]): void {
  const f = approvalsFile();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ approvals }, null, 2));
}

/** Apre una richiesta di approvazione. Ritorna la richiesta. */
export function approvalRequest(action: string, target: string, reason = ""): Approval {
  if (!action.trim() || !target.trim()) throw new Error("approval vuole action e target");
  const all = load();
  const req: Approval = {
    id: `appr-${Date.now()}-${++seq}`,
    action: action.slice(0, 120),
    target: target.slice(0, 300),
    reason: reason.slice(0, 300),
    status: "open",
    created: Date.now(),
  };
  all.push(req);
  save(all);
  return req;
}

/** Richieste ancora aperte. */
export function approvalsOpen(): Approval[] {
  return load().filter((a) => a.status === "open");
}

/** Risponde a una richiesta. Ritorna true se trovata e aperta. */
export function approvalRespond(id: string, allow: boolean): boolean {
  const all = load();
  const a = all.find((x) => x.id === id && x.status === "open");
  if (!a) return false;
  a.status = allow ? "allowed" : "denied";
  a.decided = Date.now();
  save(all);
  return true;
}

export const permissions = { request: approvalRequest, open: approvalsOpen, respond: approvalRespond };
