// Modulo PLUGIN — manager + SDK (stile Hermes plugins/ + SDK).
// Directory: OMNICORE_PLUGINS_DIR o ~/.omnicore/plugins.
// Manifesto plugin.json {name, version, author, description?, entry?, permissions?[]?}.
// PluginContext: registerTool/registerHook/llm/config/log. Le credenziali LLM
// restano nell'host: ctx.llm.complete() chiama llmChat senza esporre chiavi.
// Fiducia: i plugin sono codice locale — installa solo fonti fidate (niente
// sandbox VM: dichiarata onestamente, vedi docs/STUDIO.md).
// Zero dipendenze. Mai throw critico (throw solo su input invalido).
import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { llmChat } from "../mind/llm.ts";

export interface PluginManifest {
  name: string;
  version: string;
  author: string;
  description: string;
  entry: string;
  permissions: string[];
}

export interface PluginToolDef { name: string; description: string; run: (args: Record<string, unknown>) => Promise<unknown> | unknown }
export interface PluginHook { event: string; fn: (data: unknown) => Promise<unknown> | unknown }

export interface PluginContext {
  name: string;
  config: Record<string, unknown>;
  log: (msg: string) => void;
  registerTool: (tool: PluginToolDef) => void;
  registerHook: (event: string, fn: PluginHook["fn"]) => void;
  llm: { complete: (system: string, user: string) => Promise<string | null> };
}

export interface LoadedPlugin { manifest: PluginManifest; dir: string; tools: PluginToolDef[]; hooks: PluginHook[] }

export function pluginsDir(): string {
  return process.env["OMNICORE_PLUGINS_DIR"] ?? join(homedir(), ".omnicore", "plugins");
}

function validName(n: string): boolean {
  return /^[a-z0-9][a-z0-9\-_]{0,40}$/i.test(n);
}

/** Legge e valida plugin.json. Throw se invalido. */
export function readManifest(dir: string): PluginManifest {
  const file = join(dir, "plugin.json");
  let j: any;
  try {
    j = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`plugin.json assente o rotto in ${dir}`);
  }
  const name = String(j?.name ?? "").trim().toLowerCase();
  if (!validName(name)) throw new Error(`manifest: name invalido in ${file}`);
  const version = String(j?.version ?? "").trim();
  if (!/^\d+\.\d+\.\d+/.test(version)) throw new Error(`manifest: version semver in ${file}`);
  return {
    name,
    version,
    author: String(j?.author ?? "").trim().slice(0, 80) || "?",
    description: String(j?.description ?? "").trim().slice(0, 200),
    entry: String(j?.entry ?? "index.js").trim() || "index.js",
    permissions: Array.isArray(j?.permissions) ? j.permissions.map(String).slice(0, 20) : [],
  };
}

/** Plugin installati (manifest validi). Mai throw. */
export function listPlugins(): { manifest: PluginManifest; dir: string; loaded: boolean }[] {
  try {
    const dir = pluginsDir();
    if (!existsSync(dir)) return [];
    const out = [];
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      try {
        if (!statSync(full).isDirectory()) continue;
        const m = readManifest(full);
        out.push({ manifest: m, dir: full, loaded: registry.has(m.name) });
      } catch { /* dir non-plugin: ignora */ }
    }
    return out.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  } catch {
    return [];
  }
}

const registry = new Map<string, LoadedPlugin>();

function makeContext(manifest: PluginManifest, loaded: { tools: PluginToolDef[]; hooks: PluginHook[] }): PluginContext {
  return {
    name: manifest.name,
    config: {},
    log: (msg: string) => {
      try {
        process.stderr.write(`[plugin:${manifest.name}] ${String(msg).slice(0, 300)}\n`);
      } catch { /* log mai fatale */ }
    },
    registerTool: (tool: PluginToolDef) => {
      if (!tool || typeof tool.name !== "string" || !/^[a-z0-9][a-z0-9\-_.]{0,60}$/i.test(tool.name)) {
        throw new Error("registerTool: name invalido");
      }
      if (typeof tool.run !== "function") throw new Error("registerTool: run deve essere funzione");
      if (loaded.tools.some((t) => t.name === tool.name)) throw new Error(`tool duplicato: ${tool.name}`);
      loaded.tools.push({ name: tool.name, description: String(tool.description ?? "").slice(0, 200), run: tool.run });
    },
    registerHook: (event: string, fn: PluginHook["fn"]) => {
      if (!event.trim() || typeof fn !== "function") throw new Error("registerHook: (event, fn)");
      loaded.hooks.push({ event: event.trim().slice(0, 40), fn });
    },
    llm: {
      complete: async (system: string, user: string) => {
        try {
          return await llmChat(system, user, 500);
        } catch {
          return null;
        }
      },
    },
  };
}

/** Carica (o ricarica) un plugin da directory. Throw se rotto. */
export async function loadPlugin(dir: string): Promise<LoadedPlugin> {
  const abs = resolve(dir);
  const manifest = readManifest(abs);
  const entry = resolve(abs, manifest.entry);
  if (!existsSync(entry)) throw new Error(`entry assente: ${manifest.entry}`);
  unloadPlugin(manifest.name);
  const loaded: { tools: PluginToolDef[]; hooks: PluginHook[] } = { tools: [], hooks: [] };
  const ctx = makeContext(manifest, loaded);
  let mod: any;
  try {
    mod = await import(pathToFileURL(entry).href);
  } catch (e) {
    throw new Error(`import fallito (${manifest.entry}): ${String(e).slice(0, 200)}`);
  }
  const setup = mod?.setup ?? mod?.default?.setup ?? mod?.default;
  if (typeof setup !== "function") throw new Error("il plugin deve esportare setup(ctx) o default setup");
  try {
    await setup(ctx);
  } catch (e) {
    throw new Error(`setup fallito: ${String(e).slice(0, 200)}`);
  }
  const lp: LoadedPlugin = { manifest, dir: abs, tools: loaded.tools, hooks: loaded.hooks };
  registry.set(manifest.name, lp);
  return lp;
}

/** Scarica un plugin (ferma futuri dispatch). */
export function unloadPlugin(name: string): boolean {
  return registry.delete(String(name).toLowerCase());
}

/** Ricarica tutti i plugin installati. Ritorna {loaded, failed}. Mai throw. */
export async function reloadPlugins(): Promise<{ loaded: string[]; failed: { name: string; error: string }[] }> {
  const loaded: string[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const p of listPlugins()) {
    try {
      await loadPlugin(p.dir);
      loaded.push(p.manifest.name);
    } catch (e) {
      failed.push({ name: p.manifest.name, error: String(e).slice(0, 200) });
    }
  }
  return { loaded, failed };
}

/** Emette un hook a tutti i plugin caricati. Mai throw, mai fatale. */
export async function emitHook(event: string, data: unknown): Promise<void> {
  for (const p of registry.values()) {
    for (const h of p.hooks) {
      if (h.event !== event) continue;
      try {
        await h.fn(data);
      } catch {
        try {
          process.stderr.write(`[plugin:${p.manifest.name}] hook ${event} fallito\n`);
        } catch { /* ignora */ }
      }
    }
  }
}

/** Chiama un tool plugin {plugin, tool, args}. Errori onesti. */
export async function callPluginTool(plugin: string, tool: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const p = registry.get(String(plugin).toLowerCase());
  if (!p) return { ok: false, error: `plugin non caricato: ${plugin} (plugin.load prima)` };
  const t = p.tools.find((x) => x.name === tool);
  if (!t) return { ok: false, error: `tool assente in ${plugin}: ${tool}` };
  try {
    return { ok: true, data: await t.run(args ?? {}) };
  } catch (e) {
    return { ok: false, error: `plugin ${plugin}.${tool}: ${String(e).slice(0, 200)}` };
  }
}

/** Tool di tutti i plugin caricati (per cataloghi/MCP). */
export function pluginTools(): { plugin: string; name: string; description: string }[] {
  const out = [];
  for (const p of registry.values()) {
    for (const t of p.tools) out.push({ plugin: p.manifest.name, name: t.name, description: t.description });
  }
  return out;
}

/** Installa da path locale (copia) o URL git (clone). Ritorna dir. Throw se fallisce. */
export async function installPlugin(source: string): Promise<{ name: string; dir: string }> {
  const dir = pluginsDir();
  mkdirSync(dir, { recursive: true });
  const s = String(source ?? "").trim();
  if (!s) throw new Error("install vuole <path|git-url>");
  if (/^https?:\/\//.test(s) || s.endsWith(".git") || s.startsWith("git@")) {
    const { spawn } = await import("node:child_process");
    const name = s.split("/").pop()!.replace(/\.git$/, "").toLowerCase().replace(/[^a-z0-9\-_]/g, "");
    if (!validName(name)) throw new Error(`nome da URL non valido: ${s.slice(0, 80)}`);
    const dest = join(dir, name);
    if (existsSync(dest)) throw new Error(`già installato: ${name}`);
    await new Promise<void>((res, rej) => {
      const child = spawn("git", ["clone", "--depth", "1", s, dest], { timeout: 60000 });
      let err = "";
      child.stderr?.on("data", (d) => (err += String(d)));
      child.on("error", (e) => rej(new Error(`git assente? ${String(e).slice(0, 120)}`)));
      child.on("close", (code) => (code === 0 ? res() : rej(new Error(`git clone exit ${code}: ${err.slice(0, 160)}`))));
    });
    readManifest(dest); // valida subito
    return { name, dir: dest };
  }
  const abs = resolve(s);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new Error(`path assente: ${s}`);
  const m = readManifest(abs);
  const dest = join(dir, m.name);
  if (resolve(dest) !== abs) {
    rmSync(dest, { recursive: true, force: true });
    cpSync(abs, dest, { recursive: true });
  }
  return { name: m.name, dir: dest };
}

/** Rimuove un plugin installato (+ unload). Throw se assente. */
export function removePlugin(name: string): { removed: string } {
  const clean = String(name ?? "").trim().toLowerCase();
  if (!validName(clean)) throw new Error(`nome invalido: ${name}`);
  const dest = join(pluginsDir(), clean);
  if (!existsSync(dest)) throw new Error(`non installato: ${clean}`);
  unloadPlugin(clean);
  rmSync(dest, { recursive: true, force: true });
  return { removed: clean };
}

export const plugins = {
  dir: pluginsDir, manifest: readManifest, list: listPlugins,
  load: loadPlugin, unload: unloadPlugin, reload: reloadPlugins,
  emit: emitHook, call: callPluginTool, tools: pluginTools,
  install: installPlugin, remove: removePlugin,
};
