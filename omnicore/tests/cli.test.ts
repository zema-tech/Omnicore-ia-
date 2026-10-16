// CLI unificata (Tappa 57): sottocomandi base, exit code onesti, delega da index.ts.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

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
