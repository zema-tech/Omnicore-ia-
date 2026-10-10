// Modulo STT — trascrizione audio (whisper.cpp locale o OpenAI cloud).
// Provider auto: whisper.cpp se WHISPER_BIN esiste, altrimenti OpenAI se
// OPENAI_API_KEY. Niente microfono/streaming realtime qui: file WAV in,
// testo out (lo streaming live resta lavoro futuro). Zero dipendenze.
// Mai throw: sempre {ok, via, ...}.
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

export interface SttResult { ok: boolean; via: string; text?: string; error?: string }

const VIA = "stt(native)";

function whisperBin(): string {
  return process.env["WHISPER_BIN"] ?? "whisper.cpp";
}

function whisperModel(): string {
  return process.env["WHISPER_MODEL"] ?? "";
}

/** Controlla header RIFF/WAVE (evita di dare mp3 a whisper). */
function checkWav(file: string): string | null {
  try {
    const fd = readFileSync(file);
    if (fd.length < 12) return "file troppo piccolo per essere WAV";
    if (fd.subarray(0, 4).toString() !== "RIFF" || fd.subarray(8, 12).toString() !== "WAVE") {
      return "non è un WAV (RIFF): converti in wav 16kHz mono";
    }
    return null;
  } catch {
    return `file illeggibile: ${file.slice(0, 120)}`;
  }
}

function stripTimestamps(out: string): string {
  return out
    .split("\n")
    .map((l) => l.replace(/^\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/, "").trim())
    .filter((l) => l && !l.startsWith("whisper_") && !l.startsWith("system_info"))
    .join("\n")
    .trim();
}

async function viaWhisper(file: string): Promise<SttResult> {
  const model = whisperModel();
  if (!model) return { ok: false, via: VIA, error: "WHISPER_MODEL non impostato (ggml .bin del modello)" };
  const timeout = Number(process.env["OMNICORE_STT_TIMEOUT_MS"] ?? "120000");
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(whisperBin(), ["-m", model, "-f", file, "-otxt", "-nt"], { timeout });
    } catch (e) {
      resolve({ ok: false, via: VIA, error: `whisper non avviabile: ${String(e).slice(0, 120)}` });
      return;
    }
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.stderr?.on("data", (d) => (err += String(d)));
    child.on("error", () => resolve({ ok: false, via: VIA, error: `whisper.cpp non trovato (${whisperBin()}). Installalo o usa OpenAI.` }));
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch { /* già morto */ }
      resolve({ ok: false, via: VIA, error: `whisper timeout ${timeout}ms` });
    }, timeout + 5000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = stripTimestamps(out);
      if (code === 0 && text) resolve({ ok: true, via: `${VIA}(whisper.cpp)`, text: text.slice(0, 4000) });
      else resolve({ ok: false, via: VIA, error: `whisper exit ${code}: ${(err || out).slice(0, 200)}` });
    });
  });
}

async function viaOpenAI(file: string): Promise<SttResult> {
  const key = process.env["OPENAI_API_KEY"] ?? "";
  if (!key) return { ok: false, via: VIA, error: "OPENAI_API_KEY non impostata (fallback whisper.cpp?)" };
  const base = (process.env["OPENAI_API_BASE"] ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env["OPENAI_STT_MODEL"] ?? "whisper-1";
  try {
    const data = readFileSync(file);
    const form = new FormData();
    form.append("file", new Blob([data], { type: "audio/wav" }), "audio.wav");
    form.append("model", model);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), Number(process.env["OMNICORE_STT_TIMEOUT_MS"] ?? "120000"));
    try {
      const r = await fetch(`${base}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: ctl.signal,
      });
      const j = (await r.json().catch(() => null)) as any;
      if (!r.ok) throw new Error(`openai stt http ${r.status}: ${String(j?.error?.message ?? "").slice(0, 120)}`);
      const text = String(j?.text ?? "").trim();
      if (!text) throw new Error("trascrizione vuota");
      return { ok: true, via: `${VIA}(openai)`, text: text.slice(0, 4000) };
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  }
}

/**
 * Trascrive un WAV: whisper.cpp se WHISPER_BIN+MODEL, altrimenti OpenAI se key,
 * altrimenti errore onesto con entrambe le strade. Mai throw.
 */
export async function sttTranscribe(file: string, opts: { provider?: string } = {}): Promise<SttResult> {
  if (!existsSync(file)) return { ok: false, via: VIA, error: `file assente: ${file.slice(0, 120)}` };
  const bad = checkWav(file);
  if (bad) return { ok: false, via: VIA, error: bad };
  const want = String(opts.provider ?? "auto").toLowerCase();
  const whisperCfg = !!(process.env["WHISPER_BIN"] || process.env["WHISPER_MODEL"]);
  const openaiCfg = !!process.env["OPENAI_API_KEY"];
  const chain = want === "whisper" ? ["whisper"]
    : want === "openai" ? ["openai"]
      : [...(whisperCfg ? ["whisper"] : []), ...(openaiCfg ? ["openai"] : [])];
  if (!chain.length) {
    return { ok: false, via: VIA, error: "niente STT configurato: WHISPER_BIN+WHISPER_MODEL (locale) oppure OPENAI_API_KEY (cloud)" };
  }
  const errors: string[] = [];
  for (const p of chain) {
    const r = p === "whisper" ? await viaWhisper(file) : await viaOpenAI(file);
    if (r.ok) return r;
    errors.push(`${p}: ${r.error}`);
  }
  return { ok: false, via: VIA, error: errors.join(" | ").slice(0, 300) };
}

export const stt = { transcribe: sttTranscribe };
