// Omnicore config — env vince su omnicore.config.json, che vince sui default.
// Zero dipendenze. Usata da index.ts e pipeline.ts (e mirrorata in Python/Rust/Bash).
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface OmnicoreConfig {
  hermesPython: string;
  hermesDir: string;
  opencodeUrl: string;
  opencodePassword: string;
  openclawUrl: string;
  openclawToken: string;
  openclawRpcPath: string;
  llmBaseUrl: string;
  llmModel: string;
  llmProvider: "api" | "local";
  llmLocalModel: string;
  decideJevUrl: string;
  decideClmUrl: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));

function readJsonConfig(): Record<string, any> {
  for (const p of [join(HERE, "..", "omnicore.config.json"), join(HERE, "omnicore.config.json")]) {
    try {
      if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      /* ignora e usa default */
    }
  }
  return {};
}

export function loadConfig(): OmnicoreConfig {
  const j = readJsonConfig();
  const here = (u: string) => u;
  return {
    hermesPython: process.env["HERMES_PYTHON"] ?? "python3",
    hermesDir:
      process.env["HERMES_DIR"] ??
      new URL("../../vendors/hermes", import.meta.url).pathname,
    opencodeUrl: process.env["OPENCODE_URL"] ?? j?.opencode?.baseUrl ?? here("http://127.0.0.1:4096"),
    opencodePassword: process.env["OPENCODE_SERVER_PASSWORD"] ?? "",
    openclawUrl: process.env["OPENCLAW_URL"] ?? j?.openclaw?.baseUrl ?? here("http://127.0.0.1:18789"),
    openclawToken: process.env["OPENCLAW_TOKEN"] ?? "",
    openclawRpcPath: j?.openclaw?.rpcPath ?? "/api/v1/admin/rpc",
    llmBaseUrl: process.env["OMNICORE_LLM_BASE_URL"] ?? j?.llm?.baseUrl ?? "",
    llmModel: process.env["OMNICORE_LLM_MODEL"] ?? j?.llm?.model ?? "omnicore-fusion",
    llmProvider: (process.env["OMNICORE_LLM_PROVIDER"] ?? j?.llm?.provider ?? "api") === "local" ? "local" : "api",
    llmLocalModel: process.env["OMNICORE_LLM_LOCAL_MODEL"] ?? j?.llm?.localModel ?? "llama3.1",
    decideJevUrl: process.env["TYPESAFE_BASE_URL"] ?? j?.decide?.jevBaseUrl ?? "https://api.typesafe.ai",
    decideClmUrl: process.env["CLM_BASE_URL"] ?? j?.decide?.clmBaseUrl ?? "http://127.0.0.1:8700",
  };
}
