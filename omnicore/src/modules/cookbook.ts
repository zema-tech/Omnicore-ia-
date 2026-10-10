// Modulo COOKBOOK — modelli locali alla Odysseus cookbook (nativo, zero deps).
// scan: hardware via node:os + nvidia-smi (best-effort) + modelli Ollama.
// recommend: tabella curata con fit score su RAM/VRAM + flag installati.
// serve: pull via API Ollama + verifica. Mai throw: sempre {ok, ...}.
import { platform, arch, cpus, totalmem, freemem } from "node:os";
import { spawn } from "node:child_process";

export interface GpuInfo { name: string; vramMB?: number }
export interface HwInfo {
  os: string; arch: string; cpu: string; cores: number;
  ramMB: number; freeMB: number; gpus: GpuInfo[];
  ollama: { reachable: boolean; models: string[] };
}
export interface ModelRec { model: string; use: string; minRamMB: number; minVramMB: number; installed: boolean; fits: boolean; score: number }

const VIA = "cookbook(native)";

function ollamaHost(): string {
  return (process.env["OLLAMA_HOST"] ?? "http://127.0.0.1:11434").replace(/\/$/, "");
}

async function ollamaTags(timeout = 5000): Promise<{ reachable: boolean; models: string[] }> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(`${ollamaHost()}/api/tags`, { signal: ctl.signal });
      if (!r.ok) return { reachable: false, models: [] };
      const j = (await r.json().catch(() => null)) as any;
      const arr = Array.isArray(j?.models) ? j.models : [];
      return { reachable: true, models: arr.map((m: any) => String(m?.name ?? "")).filter(Boolean) };
    } finally {
      clearTimeout(t);
    }
  } catch {
    return { reachable: false, models: [] };
  }
}

function nvidiaGpus(): Promise<GpuInfo[]> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], { timeout: 8000 });
    } catch {
      resolve([]);
      return;
    }
    let out = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.on("error", () => resolve([]));
    child.on("close", (code) => {
      if (code !== 0) return resolve([]);
      const gpus: GpuInfo[] = [];
      for (const line of out.split("\n")) {
        const m = line.trim().match(/^(.+?),\s*(\d+)\s*$/);
        if (m) gpus.push({ name: m[1].trim(), vramMB: Number(m[2]) });
      }
      resolve(gpus);
    });
  });
}

/** Scansione hardware + modelli installati. Mai throw. */
export async function hwScan(): Promise<{ ok: boolean; via: string; hw: HwInfo }> {
  try {
    const cs = cpus();
    const [gpus, ollama] = await Promise.all([nvidiaGpus(), ollamaTags()]);
    return {
      ok: true, via: VIA,
      hw: {
        os: `${platform()}`, arch: arch(),
        cpu: cs[0]?.model?.trim() || "?", cores: cs.length,
        ramMB: Math.round(totalmem() / 1048576), freeMB: Math.round(freemem() / 1048576),
        gpus, ollama,
      },
    };
  } catch (e) {
    return { ok: false, via: VIA, hw: { os: "?", arch: "?", cpu: "?", cores: 0, ramMB: 0, freeMB: 0, gpus: [], ollama: { reachable: false, models: [] } }, };
  }
}

const CATALOG: { model: string; use: string; minRamMB: number; minVramMB: number }[] = [
  { model: "nomic-embed-text", use: "embedding per memoria vettoriale", minRamMB: 2000, minVramMB: 0 },
  { model: "llama3.1:8b", use: "chat/generale equilibrato", minRamMB: 8000, minVramMB: 0 },
  { model: "qwen2.5:7b", use: "chat + codice", minRamMB: 8000, minVramMB: 0 },
  { model: "deepseek-r1:8b", use: "ragionamento", minRamMB: 8000, minVramMB: 0 },
  { model: "llama3.1:70b", use: "top qualità, hardware serio", minRamMB: 40000, minVramMB: 40000 },
];

/** Raccomanda modelli: fit score 0-100 su RAM (e VRAM se serve). Puro, testabile. */
export function recommend(hw: HwInfo, installed: string[] = hw.ollama.models): ModelRec[] {
  const vram = hw.gpus.reduce((n, g) => n + (g.vramMB ?? 0), 0);
  return CATALOG.map((c) => {
    const ramFit = Math.min(1, hw.ramMB / Math.max(1, c.minRamMB));
    const vramFit = c.minVramMB > 0 ? Math.min(1, vram / c.minVramMB) : 1;
    const score = Math.round(Math.min(ramFit, vramFit) * 100);
    const fits = score >= 100;
    return { ...c, installed: installed.some((m) => m === c.model || m.startsWith(c.model + ":")), fits, score };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Scarica un modello via API Ollama (pull streaming) e verifica in tags.
 * Serve Ollama in esecuzione. Mai throw.
 */
export async function serveModel(model: string): Promise<{ ok: boolean; via: string; detail: string }> {
  const m = String(model ?? "").trim();
  if (!m) return { ok: false, via: VIA, detail: "cookbook.serve vuole {model}" };
  const timeout = Number(process.env["OMNICORE_COOKBOOK_TIMEOUT_MS"] ?? "120000");
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(`${ollamaHost()}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: m, stream: true }),
        signal: ctl.signal,
      });
      if (!r.ok || !r.body) throw new Error(`ollama pull http ${r.status} (Ollama attivo? ${ollamaHost()})`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let okLine = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          if (l.includes('"status":"success"')) okLine = true;
          if (/error/i.test(l) && l.includes("error")) throw new Error(`pull: ${l.slice(0, 160)}`);
        }
      }
      try {
        await reader.cancel();
      } catch { /* chiusura */ }
      if (!okLine) throw new Error("pull senza conferma success");
      const { models } = await ollamaTags();
      const present = models.some((x) => x === m || x.startsWith(m + ":"));
      return present
        ? { ok: true, via: VIA, detail: `${m} pronto — impostalo come OMNICORE_LLM_LOCAL_MODEL per usarlo` }
        : { ok: false, via: VIA, detail: `${m}: pull ok ma non in tags, verifica su Ollama` };
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    const msg = String(e);
    const hint = /fetch failed|ECONNREFUSED|abort/i.test(msg)
      ? `Ollama non raggiungibile (${ollamaHost()}) — avvialo e riprova`
      : msg.slice(0, 200);
    return { ok: false, via: VIA, detail: hint };
  }
}

export const cookbook = { scan: hwScan, recommend, serve: serveModel };
