// Omnicore shared types. Zero dependencies.

export type Intent = "memory" | "code" | "chat" | "ops";

export interface OmnicoreRequest {
  text: string;
  sessionKey?: string;
  directory?: string;
  target?: string;
}

export interface OmnicoreResponse {
  intent: Intent;
  handler: "hermes" | "opencode" | "openclaw";
  result: unknown;
}

export interface HermesConfig {
  /** python binary, default "python3" */
  python?: string;
  /** path to vendors/hermes, default "../vendors/hermes" relative to cwd */
  hermesDir?: string;
}

export interface OpenCodeConfig {
  /** base URL of `opencode serve`, e.g. http://127.0.0.1:4096 */
  baseUrl: string;
  password?: string;
  /** CLI fallback binary */
  cli?: string;
}

export interface OpenClawConfig {
  /** base URL of OpenClaw gateway / admin-http-rpc */
  baseUrl: string;
  token?: string;
}
