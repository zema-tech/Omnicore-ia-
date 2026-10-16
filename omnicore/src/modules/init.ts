import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function defaultConfigText(): string {
  return JSON.stringify(
    {
      _note:
        "Creato da `omnicore init`. Chiavi opzionali: profile.active (light|medium|alt), llm, decide, opencode, openclaw. Precedenza: env > questo file > default.",
      profile: { active: "light" },
    },
    null,
    2,
  ) + "\n";
}

export interface InitReport {
  dir: string;
  created: string[];
  kept: string[];
}

export function ensureInit(dir: string): InitReport {
  const created: string[] = [];
  const kept: string[] = [];
  for (const sub of ["", "data", join("data", "vault")]) {
    const p = sub ? join(dir, sub) : dir;
    if (existsSync(p)) {
      kept.push(sub || ".");
    } else {
      mkdirSync(p, { recursive: true });
      created.push(sub || ".");
    }
  }
  const cfg = join(dir, "omnicore.config.json");
  if (existsSync(cfg)) {
    kept.push("omnicore.config.json");
  } else {
    writeFileSync(cfg, defaultConfigText(), "utf8");
    created.push("omnicore.config.json");
  }
  return { dir, created, kept };
}
