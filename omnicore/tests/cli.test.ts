// CLI unificata (Tappe 57-59): sottocomandi base+estesi+init, exit code onesti, delega da index.ts.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureInit } from "../src/modules/init.ts";

const HERE = new URL("..", import.meta.url).pathname;
const ENV = { ...process.env, OMNICORE_WORKSPACE: HERE };

function cli(...args: string[]) {
  return spawnSync(process.execPath, ["--experimental-strip-types", "src/cli.ts", ...args], {
    cwd: HERE,
    encoding: "utf8",
    env: ENV,
  });
}

describe("cli base (tappa 57)", () => {
  it("version: stampa versione, exit 0", () => {
    const p = cli("version");
    assert.equal(p.status, 0);
    assert.match(p.stdout, /^omnicore \d+\.\d+\.\d+/);
  });
  it("help: elenca comandi, exit 0", () => {
    const p = cli("help");
    assert.equal(p.status, 0);
    for (const c of ["doctor", "status", "skills", "version"]) assert.ok(p.stdout.includes(c));
  });
  it("comando sconosciuto: exit 2", () => {
    const p = cli("frobnicare");
    assert.equal(p.status, 2);
  });
  it("doctor --offline: rapporto, exit onesto", () => {
    const p = cli("doctor", "--offline");
    assert.ok(p.status === 0 || p.status === 1);
    assert.match(p.stdout, /Omnicore doctor/);
  });
  it("doctor --offline --json: JSON con checks", () => {
    const p = cli("doctor", "--offline", "--json");
    assert.equal(p.status, 0);
    const j = JSON.parse(p.stdout) as { checks?: unknown[] };
    assert.ok(Array.isArray(j.checks) && j.checks.length >= 8);
  });
  it("status --json: campi chiave", () => {
    const p = cli("status", "--json");
    assert.equal(p.status, 0);
    const j = JSON.parse(p.stdout) as { name?: string; version?: string };
    assert.equal(j.name, "omnicore");
    assert.ok(typeof j.version === "string" && j.version.length > 0);
  });
  it("skills list: exit 0", () => {
    const p = cli("skills", "list");
    assert.equal(p.status, 0);
  });
  it("bin/omnicore.js version: fumo", () => {
    const p = spawnSync(process.execPath, ["bin/omnicore.js", "version"], {
      cwd: HERE,
      encoding: "utf8",
      env: ENV,
    });
    assert.equal(p.status, 0);
    assert.match(p.stdout, /^omnicore \d+\.\d+\.\d+/);
  });
  it("index.ts delega: doctor --offline resta compatibile", () => {
    const p = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "src/index.ts", "doctor", "--offline"],
      { cwd: HERE, encoding: "utf8", env: ENV },
    );
    assert.equal(p.status, 0);
    assert.match(p.stdout, /Omnicore doctor/);
  });
});

describe("cli estesa (tappa 58)", () => {
  it("help: elenca i nuovi comandi", () => {
    const p = cli("help");
    assert.equal(p.status, 0);
    for (const c of ["serve", "web", "chat", "tui", "gateway", "code"]) {
      assert.ok(p.stdout.includes(c));
    }
  });
  it("code senza obiettivo: exit 2, nessun turno", () => {
    const p = cli("code");
    assert.equal(p.status, 2);
    assert.match(p.stderr + p.stdout, /uso: omnicore code/);
  });
  it("index.ts delega: code senza obiettivo resta compatibile", () => {
    const p = spawnSync(process.execPath, ["--experimental-strip-types", "src/index.ts", "code"], {
      cwd: HERE,
      encoding: "utf8",
      env: ENV,
    });
    assert.equal(p.status, 2);
  });
  it("bin/omnicore.js help: fumo comandi estesi", () => {
    const p = spawnSync(process.execPath, ["bin/omnicore.js", "help"], {
      cwd: HERE,
      encoding: "utf8",
      env: ENV,
    });
    assert.equal(p.status, 0);
    assert.ok(p.stdout.includes("gateway") && p.stdout.includes("code"));
  });
});

describe("cli init (tappa 59)", () => {
  it("ensureInit: crea e poi conserva (idempotente)", () => {
    const dir = mkdtempSync(join(tmpdir(), "omni-init-"));
    const first = ensureInit(dir);
    assert.ok(first.created.includes("omnicore.config.json"));
    assert.ok(first.created.includes("data"));
    const second = ensureInit(dir);
    assert.deepEqual(second.created, []);
    assert.ok(second.kept.includes("omnicore.config.json"));
  });
  it("init: exit 0, init --json parsabile", () => {
    const p = cli("init");
    assert.equal(p.status, 0);
    const j = cli("init", "--json");
    assert.equal(j.status, 0);
    const rep = JSON.parse(j.stdout) as { created?: unknown; kept?: unknown };
    assert.ok(Array.isArray(rep.created) && Array.isArray(rep.kept));
  });
  it("doctor --offline --json: contiene il check init", () => {
    const p = cli("doctor", "--offline", "--json");
    assert.equal(p.status, 0);
    const j = JSON.parse(p.stdout) as { checks?: { id?: string }[] };
    assert.ok(Array.isArray(j.checks) && j.checks.some((c) => c.id === "init"));
  });
});
