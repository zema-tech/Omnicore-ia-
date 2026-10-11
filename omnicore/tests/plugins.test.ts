// Test plugin manager + SDK: manifest, load/call/hook, install/remove, CLI.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { plugins } from "../src/modules/plugins.ts";
import { runTool } from "../src/agent/tools.ts";

let dir = "";
let saved: string | undefined;

const PLUGIN_JS = `exports.setup = async (ctx) => {
  ctx.registerTool({ name: "saluta", description: "saluta qualcuno",
    run: async (args) => "ciao " + (args.nome || "mondo") });
  ctx.registerHook("turn_end", async () => {});
};`;

function mkplugin(parent: string, name = "saluto", extra: Record<string, unknown> = {}): string {
  const d = join(parent, name);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "plugin.json"), JSON.stringify({ name, version: "1.0.0", author: "test", description: "prova", entry: "index.js", ...extra }));
  writeFileSync(join(d, "index.js"), PLUGIN_JS);
  return d;
}

beforeEach(() => {
  saved = process.env["OMNICORE_PLUGINS_DIR"];
  dir = mkdtempSync(join(tmpdir(), "plugins-test-"));
  process.env["OMNICORE_PLUGINS_DIR"] = join(dir, "store");
});

afterEach(() => {
  for (const n of plugins.list().filter((p) => p.dir.startsWith(dir)).map((p) => p.manifest.name)) {
    plugins.unload(n);
  }
  if (saved === undefined) delete process.env["OMNICORE_PLUGINS_DIR"];
  else process.env["OMNICORE_PLUGINS_DIR"] = saved;
  rmSync(dir, { recursive: true, force: true });
});

describe("plugin manager", () => {
  it("manifest invalido rifiutato", () => {
    const d = join(dir, "rotto");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "plugin.json"), JSON.stringify({ name: "NO MAIUSCOLE!!", version: "x" }));
    assert.throws(() => plugins.manifest(d));
  });
  it("load/call/unload con tool e hook", async () => {
    const d = mkplugin(join(dir, "src"));
    const lp = await plugins.load(d);
    assert.equal(lp.manifest.name, "saluto");
    assert.deepEqual(lp.tools.map((t) => t.name), ["saluta"]);
    assert.equal(lp.hooks.length, 1);
    const c = await plugins.call("saluto", "saluta", { nome: "zem" });
    assert.equal(c.ok, true);
    assert.equal(c.data, "ciao zem");
    assert.equal((await plugins.call("saluto", "fantasma")).ok, false);
    assert.equal((await plugins.call("assente", "x")).ok, false);
    await plugins.emit("turn_end", { test: 1 }); // hook non deve lanciare
    assert.equal(plugins.unload("saluto"), true);
    assert.equal(plugins.unload("saluto"), false);
  });
  it("setup assente: errore onesto", async () => {
    const d = join(dir, "vuoto");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "plugin.json"), JSON.stringify({ name: "vuoto", version: "1.0.0" }));
    writeFileSync(join(d, "index.js"), "exports.niente = 1;");
    await assert.rejects(plugins.load(d));
  });
  it("install da path + remove", async () => {
    const src = mkplugin(join(dir, "src2"), "copiato");
    void src;
    const ins = await plugins.install(join(dir, "src2", "copiato"));
    assert.equal(ins.name, "copiato");
    assert.ok(plugins.list().some((p) => p.manifest.name === "copiato"));
    assert.deepEqual(plugins.remove("copiato"), { removed: "copiato" });
    assert.throws(() => plugins.remove("copiato"));
  });
  it("catalogo: search + install by name", async () => {
    const found = plugins.search("saluta");
    assert.ok(found.some((e) => e.name === "hello-world"));
    assert.ok(found.every((e) => e.tier === "official" || e.tier === "community"));
    const ins = await plugins.installByName("hello-world");
    assert.equal(ins.name, "hello-world");
    const lp = await plugins.load(ins.dir);
    assert.ok(lp.tools.some((t) => t.name === "saluta"));
    const c = await plugins.call("hello-world", "saluta", { nome: "cat" });
    assert.equal(c.data, "ciao cat (chiamata #1)");
    await assert.rejects(plugins.installByName("fantasma-xyz"));
  });
});

describe("plugin nei tool e CLI", () => {
  it("list/info/call con gate conferma", async () => {
    const src = mkplugin(join(dir, "s3"), "gatto");
    void src;
    await plugins.install(join(dir, "s3", "gatto"));
    const l = await runTool({ name: "plugin.list", args: {} });
    assert.ok((l.data as any[]).some((p: any) => p.name === "gatto"));
    const i = await runTool({ name: "plugin.info", args: { name: "gatto" } });
    assert.equal((i.data as any).version, "1.0.0");
    const nc = await runTool({ name: "plugin.call", args: { plugin: "gatto", tool: "saluta" } });
    assert.equal(nc.needsConfirm, true);
    const nl = await runTool({ name: "plugin.load", args: { name: "gatto" } });
    assert.equal(nl.needsConfirm, true);
    const ok = await runTool({ name: "plugin.load", args: { name: "gatto", confirm: true } });
    assert.equal(ok.ok, true);
    const c = await runTool({ name: "plugin.call", args: { plugin: "gatto", tool: "saluta", args: { nome: "cli" }, confirm: true } });
    assert.equal(c.ok, true);
    assert.equal(c.data, "ciao cli");
  });
  it("CLI --plugins list", () => {
    const r = spawnSync("node", ["--experimental-strip-types", "src/index.ts", "--plugins", "list"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, OMNICORE_PLUGINS_DIR: join(dir, "store") },
      encoding: "utf8",
      timeout: 60000,
    });
    const j = JSON.parse(r.stdout || "[]");
    assert.ok(Array.isArray(j));
  });
});
