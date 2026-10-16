// Omnicore CLI unificata (Tappe 57-58): `omnicore <comando>` stile Hermes/OpenCode.
// Base (57): help/version/doctor/status/skills. Estesa (58): serve/web/chat/tui/gateway/code.
// I flag storici di index.ts (--agent, --doctor, --skills, …) restano invariati.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CLI_COMMANDS = ["help", "version", "doctor", "status", "skills", "serve", "web", "chat", "tui", "gateway", "code"] as const;
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
    "  serve [--port N]                  API + dashboard (guscio HTTP del loop)",
    "  web                               dashboard web (dev)",
    "  chat                              chat interattiva nel terminale",
    "  tui                               interfaccia testuale",
    "  gateway                           server MCP su stdio",
    "  code <obiettivo>                  esegue un turno dell'agente e stampa la risposta",
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

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const OMNICORE_DIR = path.resolve(SRC_DIR, "..");
const REPO_DIR = path.resolve(OMNICORE_DIR, "..");

function runChild(cmd: string, args: string[], cwd: string): number {
  const p = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (p.error) {
    console.error(`${cmd}: ${String(p.error).slice(0, 200)}`);
    return 1;
  }
  return typeof p.status === "number" ? p.status : 1;
}

function nodeEntry(script: string, args: string[]): number {
  return runChild(process.execPath, ["--experimental-strip-types", script, ...args], SRC_DIR);
}

function portArg(rest: string[]): string[] {
  const i = rest.indexOf("--port");
  if (i >= 0 && rest[i + 1] !== undefined && !rest[i + 1].startsWith("--")) {
    return ["--port", rest[i + 1]];
  }
  return [];
}

async function cmdServe(rest: string[]): Promise<number> {
  return runChild("python3", [path.join(OMNICORE_DIR, "server.py"), ...portArg(rest)], OMNICORE_DIR);
}

async function cmdWeb(): Promise<number> {
  return runChild("npm", ["run", "dev"], path.join(REPO_DIR, "apps/web"));
}

async function cmdChat(rest: string[]): Promise<number> {
  return nodeEntry("./chat.ts", rest);
}

async function cmdTui(rest: string[]): Promise<number> {
  return nodeEntry("./tui.ts", rest);
}

async function cmdGateway(rest: string[]): Promise<number> {
  return nodeEntry("./mcp-serve.ts", rest);
}

async function cmdCode(rest: string[]): Promise<number> {
  const goal = rest.filter((a) => !a.startsWith("--")).join(" ").trim();
  if (goal.length === 0) {
    console.error("uso: omnicore code <obiettivo>");
    return 2;
  }
  try {
    const { runAgent } = await import("./agent/index.ts");
    const res = await runAgent(goal, { directory: workspaceDir() });
    console.log(res.reply);
    return res.aborted ? 1 : 0;
  } catch (e) {
    console.error(`code: ${String(e).slice(0, 250)}`);
    return 1;
  }
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
    case "serve":
      return cmdServe(rest);
    case "web":
      return cmdWeb();
    case "chat":
      return cmdChat(rest);
    case "tui":
      return cmdTui(rest);
    case "gateway":
      return cmdGateway(rest);
    case "code":
      return cmdCode(rest);
    default:
      console.error(`comando sconosciuto: ${cmd}\n`);
      console.error(cliHelp());
      return 2;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runCli(process.argv.slice(2));
}
