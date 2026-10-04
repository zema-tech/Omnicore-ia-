// Omnicore pipeline — la FUSIONE vera: brain -> hands -> face.
//   1. brain (Hermes, Python/stdio MCP): recall del passato, best-effort.
//   2. hands (OpenCode, TS/Go/Node): solo se intent=code, server + fallback CLI.
//   3. face  (OpenClaw, gateway): status/cron best-effort, MAI fatale.
// Ogni step registra {step, via, ok, result|error}: nessun throw esce da fuse().
import { route } from "./router.ts";
import { hermes } from "./adapters/hermes.ts";
import { opencode } from "./adapters/opencode.ts";
import { openclaw } from "./adapters/openclaw.ts";
import { loadConfig } from "./config.ts";
import type { OmnicoreRequest } from "./types.ts";

export interface FuseStep {
  step: "brain" | "hands" | "face";
  via: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface FuseResult {
  intent: string;
  handler: string;
  text: string;
  steps: FuseStep[];
}

function err(e: unknown): string {
  return String(e).slice(0, 300);
}

/** Esegue la fusione completa. Non lancia mai eccezioni. */
export async function fuse(req: OmnicoreRequest): Promise<FuseResult> {
  const cfg = loadConfig();
  const { intent, handler } = route(req);
  const steps: FuseStep[] = [];

  // 1) BRAIN — Hermes recall (Python MCP stdio)
  try {
    const brain = await hermes.recall(req.text, 5, {
      python: cfg.hermesPython,
      hermesDir: cfg.hermesDir,
    });
    steps.push({ step: "brain", via: "hermes(mcp_serve.py: conversations_list) [python]", ok: true, result: brain });
  } catch (e) {
    steps.push({ step: "brain", via: "hermes(mcp_serve.py) [python]", ok: false, error: err(e) });
  }

  // 2) HANDS — OpenCode solo per intent code (server HTTP, fallback CLI)
  if (intent === "code") {
    try {
      const hands = await opencode.promptServer(req.text, {
        baseUrl: cfg.opencodeUrl,
        password: cfg.opencodePassword || undefined,
      }, { directory: req.directory });
      steps.push({ step: "hands", via: "opencode(serve /session) [ts/http]", ok: true, result: hands });
    } catch (e1) {
      try {
        const cli = await opencode.promptCli(req.text, {}, { directory: req.directory });
        steps.push({ step: "hands", via: "opencode(run --format json) [cli]", ok: true, result: cli.slice(0, 2000) });
      } catch (e2) {
        steps.push({ step: "hands", via: "opencode [ts/http+cli]", ok: false, error: `${err(e1)} | cli: ${err(e2)}` });
      }
    }
  } else {
    steps.push({ step: "hands", via: "opencode [skip: intent!=code]", ok: true, result: "skipped" });
  }

  // 3) FACE — OpenClaw status best-effort (Rust/Bash possono riusare lo stesso rpc)
  try {
    const face = await openclaw.status({ baseUrl: cfg.openclawUrl, token: cfg.openclawToken || undefined });
    steps.push({ step: "face", via: "openclaw(POST /api/v1/admin/rpc status) [http]", ok: true, result: face });
  } catch (e) {
    steps.push({ step: "face", via: "openclaw(admin-http-rpc) [http]", ok: false, error: err(e) });
  }

  return { intent, handler, text: req.text, steps };
}
