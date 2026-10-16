#!/usr/bin/env node
// Binario `omnicore` (Tappa 57): delega a src/cli.ts (TypeScript nativo via strip-types).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "src", "cli.ts");
const r = spawnSync(process.execPath, ["--experimental-strip-types", cli, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);
