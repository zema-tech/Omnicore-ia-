// Omnicore CLI unificata (Tappa 57): `omnicore <comando>` stile Hermes/OpenCode.
// Base: help/version/doctor/status/skills. Le tappe 58-60 aggiungono gli altri.
// I flag storici di index.ts (--agent, --doctor, --skills, …) restano invariati.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const CLI_COMMANDS = ["help", "version", "doctor", "status", "skills"] as const;
export type CliCommand = (typeof CLI_COMMANDS)[number];

export function isCliCommand(a: string | undefined): a is CliCommand {
  return typeof a === "string" && (CLI_COMMANDS as readonly string[]).includes(a);
}

function pkgVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function omnicoreVersion(): string {
  return pkgVersion();
}

export function cliHelp(): string {
  return [
    "omnicore — un solo agente (memoria · codice · presenza)",
    "",
    "Uso: omnicore <comando> [opzioni]",
    "",
    "Comandi:",
    "  version                          mostra la versione",
    "  help                             mostra questo aiuto",
    "  doctor [--fix] [--json] [--offline]  diagnostica (exit 1 se errori)",
    "  status [--json]                  versione, runtime, workspace e file chiave",
    "  skills [list] [--json]            elenco skill disponibili",
    "",
    "Compatibilità: restano validi `node src/index.ts --agent …`, `--doctor`, `--skills`, …",
  ].join("\n");
}

function hasFlag(argv: string[], ...names: string[]): boolean {
  return argv.some((a) => names.includes(a));
}

function workspaceDir(): string {
  return process.env["OMNICORE_WORKSPACE"] ?? process.cwd();
}

async function cmdDoctor(rest: string[]): Promise<number> {
  const { runDoctor, formatDoctorText } = await import("./modules/doctor.ts");
  const report = await runDoctor({
    live: !hasFlag(rest, "--offline"),
    fix: hasFlag(rest, "--fix"),
  });
  console.log(hasFlag(rest, "--json") ? JSON.stringify(report, null, 2) : formatDoctorText(report));
  return report.checks.some((c) => c.level === "ko") ? 1 : 0;
}

async function cmdStatus(rest: string[]): Promise<number> {
  const ws = workspaceDir();
  const cfg =
    ["omnicore.config.json", "omnicore/omnicore.config.json"]
      .map((p) => path.join(ws, p))
      .find((p) => existsSync(p)) ?? null;
  const data =
    ["data", "omnicore/data"].map((p) => path.join(ws, p)).find((p) => existsSync(p)) ?? null;
  const info = {
    name: "omnicore",
    version: pkgVersion(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    workspace: ws,
    config: cfg,
    data,
  };
  if (hasFlag(rest, "--json")) {
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.log(
      [
        `omnicore ${info.version}`,
        `node ${info.node} (${info.platform})`,
        `workspace: ${ws}`,
        `config: ${cfg ?? "assente"}`,
        `data: ${data ?? "assente"}`,
      ].join("\n"),
    );
  }
  return 0;
}

async function cmdSkills(rest: string[]): Promise<number> {
  const sub = rest.find((a) => !a.startsWith("--")) ?? "list";
  if (sub !== "list") {
    console.error(`skills: sottocomando sconosciuto '${sub}' (uso: skills [list] [--json])`);
    return 2;
  }
  const { listSkills } = await import("./modules/skills.ts");
  let skills: { name: string; description: string; path: string }[];
  try {
    skills = listSkills().map((s) => ({ name: s.name, description: s.description, path: s.path }));
  } catch (e) {
    console.error(`skills: ${String(e).slice(0, 250)}`);
    return 1;
  }
  if (hasFlag(rest, "--json")) {
    console.log(JSON.stringify(skills, null, 2));
  } else if (skills.length === 0) {
    console.log("nessuna skill trovata.");
  } else {
    console.log(skills.map((s) => `${s.name} — ${s.description}`).join("\n"));
  }
  return 0;
}

export async function runCli(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(cliHelp());
      return 0;
    case "version":
    case "--version":
    case "-V":
      console.log(`omnicore ${pkgVersion()}`);
      return 0;
    case "doctor":
      return cmdDoctor(rest);
    case "status":
      return cmdStatus(rest);
    case "skills":
      return cmdSkills(rest);
    default:
      console.error(`comando sconosciuto: ${cmd}\n`);
      console.error(cliHelp());
      return 2;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runCli(process.argv.slice(2));
}
