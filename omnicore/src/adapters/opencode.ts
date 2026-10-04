// OpenCode adapter — hands: coding tasks.
// Primary: `opencode serve` HTTP API (see packages/opencode/src/cli/cmd/serve.ts).
//   - auth: OPENCODE_SERVER_PASSWORD -> Bearer
//   - per-project dir via `x-opencode-directory` header
// Fallback: `opencode run "prompt" --format json` CLI (see cmd/run.ts).
// JS SDK lives at vendors/opencode/packages/sdk/js/src (client/server/v2).
import { spawn } from "node:child_process";
import type { OpenCodeConfig } from "../types.ts";

function headers(cfg: OpenCodeConfig, directory?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.password) h["Authorization"] = `Bearer ${cfg.password}`;
  if (directory) h["x-opencode-directory"] = directory;
  return h;
}

/** Fire a prompt at a running `opencode serve` instance. */
export async function promptServer(prompt: string, cfg: OpenCodeConfig, opts: { directory?: string; model?: string } = {}): Promise<unknown> {
  const res = await fetch(new URL("/session/prompt", cfg.baseUrl), {
    method: "POST",
    headers: headers(cfg, opts.directory),
    body: JSON.stringify({ prompt, ...(opts.model ? { model: opts.model } : {}) }),
  });
  if (!res.ok) throw new Error(`opencode serve ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

/** CLI fallback: `opencode run "<prompt>" --format json`. Streams JSON events. */
export function promptCli(prompt: string, cfg: Partial<OpenCodeConfig> = {}, opts: { directory?: string } = {}): Promise<string> {
  const bin = cfg.cli ?? "opencode";
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["run", prompt, "--format", "json"], {
      cwd: opts.directory ?? process.cwd(),
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", reject);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("opencode run timeout"));
    }, 120_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`opencode run exit ${code}: ${err.slice(0, 500)}`));
    });
  });
}

export const opencode = { promptServer, promptCli };
