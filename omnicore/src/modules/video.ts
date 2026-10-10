// Modulo VIDEO — generazione video come tool di prima classe (stile OpenClaw
// video_generate). Provider FAL queue API: submit → poll status → download nel
// workspace (jail). Costa denaro vero: tool con conferma come i distruttivi.
// Key solo env FAL_KEY (mai loggata). Zero dipendenze. Mai throw.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, basename } from "node:path";
import { resolveInRoot, workspaceRoot } from "../faculties/native_fs.ts";

export interface VideoOpts {
  prompt: string;
  model?: string;
  durationS?: number;
  size?: string;
  filename?: string;
  pollMs?: number;
}
export interface VideoResult { ok: boolean; via: string; file?: string; url?: string; error?: string }

const VIA = "video(fal)";

function falBase(): string {
  return (process.env["FAL_API_BASE"] ?? "https://queue.fal.run").replace(/\/$/, "");
}

function needKey(): string | null {
  return process.env["FAL_KEY"] ? null : "FAL_KEY non impostata (fal.ai → API key)";
}

async function falJson(url: string, init: RequestInit, timeout: number): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, {
      ...init,
      headers: { Authorization: `Key ${process.env["FAL_KEY"] ?? ""}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: ctl.signal,
    });
    const j = (await r.json().catch(() => null)) as any;
    if (!r.ok) throw new Error(`fal http ${r.status}: ${String(j?.detail ?? j?.error ?? "").slice(0, 120)}`);
    return j;
  } finally {
    clearTimeout(t);
  }
}

/** Genera un video dal prompt e lo salva nel workspace. Mai throw. */
export async function videoGenerate(o: VideoOpts): Promise<VideoResult> {
  const keyErr = needKey();
  if (keyErr) return { ok: false, via: VIA, error: keyErr };
  const prompt = String(o.prompt ?? "").trim();
  if (prompt.length < 3) return { ok: false, via: VIA, error: "video.generate vuole {prompt}" };
  const model = String(o.model ?? process.env["FAL_VIDEO_MODEL"] ?? "fal-ai/ltx-video");
  const timeout = Number(process.env["OMNICORE_VIDEO_TIMEOUT_MS"] ?? "300000");
  const pollMs = Math.max(1000, Math.min(o.pollMs ?? 3000, 15000));
  try {
    const sub = await falJson(`${falBase()}/${model}`, {
      method: "POST",
      body: JSON.stringify({
        prompt,
        ...(o.durationS ? { duration: `${o.durationS}s` } : {}),
        ...(o.size ? { video_size: o.size } : {}),
      }),
    }, 30000);
    const requestId = String(sub?.request_id ?? "");
    if (!requestId) throw new Error("submit senza request_id");
    const t0 = Date.now();
    let videoUrl = "";
    for (;;) {
      if (Date.now() - t0 > timeout) throw new Error(`timeout ${timeout}ms in attesa del video`);
      await new Promise((r) => setTimeout(r, pollMs));
      const st = await falJson(`${falBase()}/${model}/requests/${requestId}/status`, { method: "GET" }, 30000);
      const status = String(st?.status ?? "");
      if (status === "COMPLETED") {
        videoUrl = String(st?.video?.url ?? st?.payload?.video?.url ?? st?.images?.[0]?.url ?? "");
        break;
      }
      if (status === "FAILED" || status === "CANCELED") {
        throw new Error(`job ${status}: ${String(st?.error ?? "").slice(0, 160)}`);
      }
    }
    if (!videoUrl) throw new Error("job completato senza url video");
    const dl = new AbortController();
    const dt = setTimeout(() => dl.abort(), 120000);
    let bytes: Uint8Array;
    try {
      const r = await fetch(videoUrl, { signal: dl.signal });
      if (!r.ok) throw new Error(`download http ${r.status}`);
      const buf = await r.arrayBuffer().catch(() => new ArrayBuffer(0));
      if (!buf.byteLength) throw new Error("video vuoto");
      if (buf.byteLength > 100_000_000) throw new Error("video oltre 100MB, scartato");
      bytes = new Uint8Array(buf);
    } finally {
      clearTimeout(dt);
    }
    const name = String(o.filename ?? `video-${Date.now()}.mp4`).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "video.mp4";
    const abs = resolveInRoot(name);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bytes);
    const rel = abs.slice(workspaceRoot().length + 1) || basename(abs);
    return { ok: true, via: VIA, file: rel, url: videoUrl };
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 250) };
  }
}

export const video = { generate: videoGenerate };
