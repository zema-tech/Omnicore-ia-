// CLI OmniLang (TS) — mirror di omniling/py/cli.py.
//   node --experimental-strip-types omniling/ts/index.ts file.omni "testo"  -> esegue
//   node --experimental-strip-types omniling/ts/index.ts --ast file.omni    -> AST JSON
//   node --experimental-strip-types omniling/ts/index.ts --check file.omni  -> solo parsing
import { readFileSync } from "node:fs";
import { parse } from "./parser.ts";
import { run } from "./executor.ts";

async function main(): Promise<number> {
  const raw = process.argv.slice(2);
  if (raw.length === 0 || raw[0] === "-h" || raw[0] === "--help") {
    console.log("uso: index.ts [--ast|--check] <file.omni> [testo...]");
    return 0;
  }
  let mode = "run";
  const args = [...raw];
  if (args[0] === "--ast" || args[0] === "--check") mode = args.shift()!.slice(2);
  const file = args.shift();
  if (!file) {
    console.error("serve file.omni");
    return 2;
  }
  let ast: Record<string, unknown>;
  try {
    ast = parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`errore sintassi: ${e instanceof Error ? e.message : e}`);
    return 1;
  }
  if (mode === "check") {
    console.log("OK");
    return 0;
  }
  if (mode === "ast") {
    console.log(JSON.stringify(ast, null, 2));
    return 0;
  }
  const text = args.join(" ") || "ciao";
  console.log(JSON.stringify(await run(ast as never, text), null, 2));
  return 0;
}

process.exit(await main());
