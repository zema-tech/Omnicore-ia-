// Omnicore router — decides who does what. No business logic in adapters.
import type { Intent, OmnicoreRequest, OmnicoreResponse } from "./types.ts";

const CODE_HINTS = [
  "fix",
  "bug",
  "refactor",
  "implementa",
  "implement",
  "commit",
  "test",
  "build",
  "codice",
  "code",
  "file",
  "repo",
  "pr ",
  "diff",
];
const MEMORY_HINTS = [
  "ricordi",
  "remember",
  "skill",
  "cron",
  " eri ",
  "avevi detto",
  "riepiloga",
  "summar",
  "past",
  "ieri",
];

export function classify(text: string): Intent {
  const t = ` ${text.toLowerCase()} `;
  if (CODE_HINTS.some((k) => t.includes(k))) return "code";
  if (MEMORY_HINTS.some((k) => t.includes(k))) return "memory";
  if (t.trim().startsWith("/") || t.includes("deploy") || t.includes("gateway")) return "ops";
  return "chat";
}

export function route(req: OmnicoreRequest): Pick<OmnicoreResponse, "intent" | "handler"> {
  const intent = classify(req.text);
  switch (intent) {
    case "code":
      return { intent, handler: "code" };
    case "memory":
      return { intent, handler: "memory" };
    case "ops":
      return { intent, handler: "presence" };
    case "chat":
    default:
      // chat goes to memory by default; presence delivers the reply
      return { intent, handler: "memory" };
  }
}
