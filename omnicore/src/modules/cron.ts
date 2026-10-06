// Modulo CRON — scheduler nativo di Omnicore (modellato su OpenClaw cron/
// e Hermes cron/: job {name, schedule, payload}, persistiti in data/cron.json).
//
// schedule: {kind:"once", at: ISO} | {kind:"every", everyMs} | {kind:"delay", delayMs}.
// tick(): esegue i job dovuti e ritorna i risultati. Il loop/server chiamano
// tick() periodicamente; niente demoni nascosti. Zero dipendenze.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Schedule = { kind: "once"; at: string } | { kind: "every"; everyMs: number } | { kind: "delay"; delayMs: number };

export interface CronJob {
  name: string;
  schedule: Schedule;
  payload: Record<string, unknown>;
  created: number;
  lastRun?: number;
  runs?: number;
}

export interface CronDue {
  job: CronJob;
  ok: boolean;
  via: string;
  detail: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));

export function cronFile(): string {
  return process.env["OMNICORE_CRON_FILE"] ?? join(HERE, "..", "..", "data", "cron.json");
}

function load(): CronJob[] {
  try {
    const raw = readFileSync(cronFile(), "utf8");
    const d = JSON.parse(raw);
    return Array.isArray(d?.jobs) ? d.jobs : [];
  } catch {
    return [];
  }
}

function save(jobs: CronJob[]): void {
  const f = cronFile();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ jobs }, null, 2));
}

/** Aggiunge (o sostituisce per nome) un job. Ritorna il job. Throw se forma invalida. */
export function cronAdd(name: string, schedule: Schedule, payload: Record<string, unknown> = {}): CronJob {
  if (!/^[a-z0-9][a-z0-9\-_]{0,60}$/i.test(name)) throw new Error(`nome job invalido: ${name}`);
  if (schedule.kind === "once" && Number.isNaN(Date.parse(schedule.at))) {
    throw new Error(`at non ISO: ${schedule.at}`);
  }
  const ms = (schedule as { everyMs?: unknown; delayMs?: unknown });
  if (schedule.kind === "every" && (typeof ms.everyMs !== "number" || ms.everyMs < 0)) {
    throw new Error("every vuole everyMs >= 0");
  }
  if (schedule.kind === "delay" && (typeof ms.delayMs !== "number" || ms.delayMs < 0)) {
    throw new Error("delay vuole delayMs >= 0");
  }
  const jobs = load().filter((j) => j.name !== name);
  const job: CronJob = { name, schedule, payload, created: Date.now() };
  jobs.push(job);
  save(jobs);
  return job;
}

export function cronList(): CronJob[] {
  return load();
}

export function cronRemove(name: string): boolean {
  const jobs = load();
  const kept = jobs.filter((j) => j.name !== name);
  if (kept.length === jobs.length) return false;
  save(kept);
  return true;
}

function isDue(j: CronJob, now: number): boolean {
  const s = j.schedule;
  if (s.kind === "once") return !j.lastRun && Date.parse(s.at) <= now;
  if (s.kind === "delay") return !j.lastRun && j.created + s.delayMs <= now;
  return (j.lastRun ?? 0) + s.everyMs <= now;
}

/** Esegue i job dovuti. Annunci → canali nativi; altri payload → registrati non eseguiti. Mai throw. */
export async function cronTick(now = Date.now()): Promise<CronDue[]> {
  const { channelSend } = await import("./channels.ts");
  const out: CronDue[] = [];
  const jobs = load();
  let changed = false;
  for (const j of jobs) {
    if (!isDue(j, now)) continue;
    try {
      const kind = String((j.payload as any)?.kind ?? "");
      if (kind === "announce") {
        const r = await channelSend(String((j.payload as any)?.message ?? ""), (j.payload as any)?.targets ?? []);
        out.push({ job: j, ok: r.ok, via: "cron+channel", detail: r.detail });
      } else {
        out.push({ job: j, ok: true, via: "cron", detail: `payload registrato (kind=${kind || "?"})` });
      }
    } catch (e) {
      out.push({ job: j, ok: false, via: "cron", detail: String(e).slice(0, 200) });
    }
    j.lastRun = now;
    j.runs = (j.runs ?? 0) + 1;
    changed = true;
  }
  if (changed) save(jobs);
  return out;
}

export const cron = { add: cronAdd, list: cronList, remove: cronRemove, tick: cronTick };
