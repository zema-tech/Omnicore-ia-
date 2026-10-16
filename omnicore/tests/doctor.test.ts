// Omnicore doctor: report completo, mai throw, exit code onesti, JSON stabile.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runDoctor, formatDoctorText } from "../src/modules/doctor.ts";

const HERE = new URL("..", import.meta.url).pathname;

function cli(...args: string[]) {
  return spawnSync(process.execPath, ["--experimental-strip-types", "src/index.ts", ...args], {
    cwd: HERE,
    encoding: "utf8",
    env: { ...process.env, OMNICORE_WORKSPACE: HERE },
  });
}

describe("modules/doctor", () => {
  it("report offline: checks completi, mai throw", async () => {
    const r = await runDoctor({ live: false });
    assert.equal(r.active, "euristica");
    assert.ok(r.checks.length >= 8);
    for (const c of r.checks) {
      assert.ok(typeof c.id === "string" && c.id.length > 0);
      assert.ok(typeof c.label === "string" && c.label.length > 0);
      assert.ok(["ok", "warn", "ko"].includes(c.level));
      assert.ok(typeof c.detail === "string" && c.detail.length > 0);
    }
    assert.ok(r.skills >= 1);
    assert.ok(Array.isArray(r.fixed));
  });
  it("workspace illeggibile -> ko, non throw", async () => {
    const saved = process.env["OMNICORE_WORKSPACE"];
    process.env["OMNICORE_WORKSPACE"] = "/nonexistent-xyz-abc";
    try {
      const r = await runDoctor({ live: false });
      const w = r.checks.find((c) => c.id === "workspace");
      assert.equal(w?.level, "ko");
      assert.ok((w?.hint ?? "").length > 0);
    } finally {
      if (saved === undefined) delete process.env["OMNICORE_WORKSPACE"];
      else process.env["OMNICORE_WORKSPACE"] = saved;
    }
  });
  it("formato testo sobrio con riepilogo", async () => {
    const r = await runDoctor({ live: false });
    const t = formatDoctorText(r);
    assert.match(t, /^Omnicore doctor — \d+ ok, \d+ avvisi, \d+ errori/);
    assert.ok(t.includes("cervello attivo: euristica"));
    assert.ok(!t.includes("Hermes") && !t.includes("hermes"));
  });
});

describe("cli --doctor", () => {
  it("--json --offline: JSON con active + checks", () => {
    const p = cli("--doctor", "--json", "--offline");
    assert.equal(p.status, 0);
    const j = JSON.parse(p.stdout) as any;
    assert.ok(["api", "local", "euristica"].includes(j.active));
    assert.ok(Array.isArray(j.checks) && j.checks.length >= 8);
  });
  it("exit 1 se un check è ko", () => {
    const p = spawnSync(process.execPath,
      ["--experimental-strip-types", "src/index.ts", "--doctor", "--offline"],
      {
        cwd: HERE,
        encoding: "utf8",
        env: { ...process.env, OMNICORE_WORKSPACE: "/nonexistent-xyz-abc" },
      });
    assert.equal(p.status, 1);
    assert.match(p.stdout, /errori/);
  });
});
