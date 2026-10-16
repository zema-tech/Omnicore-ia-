// Agenzie native: piano di ruoli + coda sul workboard, esecuzione best-effort.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agency } from "../src/modules/agency.ts";
import { board } from "../src/modules/workboard.ts";
import { runTool } from "../src/agent/tools.ts";

let dir = "";
let ws = "";
const keys = ["OMNICORE_AGENCIES_FILE", "OMNICORE_BOARD_FILE", "OMNICORE_SESSIONS_FILE", "OMNICORE_WORKSPACE"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of keys) saved[k] = process.env[k];
  dir = mkdtempSync(join(tmpdir(), "agency-test-"));
  ws = mkdtempSync(join(tmpdir(), "agency-ws-"));
  process.env["OMNICORE_AGENCIES_FILE"] = join(dir, "agencies.json");
  process.env["OMNICORE_BOARD_FILE"] = join(dir, "workboard.json");
  process.env["OMNICORE_SESSIONS_FILE"] = join(dir, "sessions.json");
  process.env["OMNICORE_WORKSPACE"] = ws;
});

afterEach(() => {
  for (const k of keys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
  rmSync(ws, { recursive: true, force: true });
});

describe("agency", () => {
  it("create mette in coda gli step con dipendenze a catena", async () => {
    const ag = await agency.create("verifica del ciclo", {
      steps: [
        { role: "research", task: "raccogli" },
        { role: "review", task: "controlla" },
      ],
    });
    assert.equal(ag.steps.length, 2);
    assert.equal(ag.status, "planned");

    const tasks = board.list();
    assert.equal(tasks.length, 2);
    const first = tasks.find((t) => t.title === "research: raccogli");
    const second = tasks.find((t) => t.title === "review: controlla");
    assert.ok(first && second);
    assert.equal(first.status, "queued");
    assert.equal(second.status, "queued");
    assert.deepEqual(second.dependsOn, [first.id]);
    assert.deepEqual(first.dependsOn, []);
  });

  it("create senza obiettivo: errore onesto", async () => {
    await assert.rejects(async () => {
      await agency.create("   ");
    }, /obiettivo/);
  });

  it("run esegue uno step ops e chiude il task sul board", async () => {
    const ag = await agency.create("operazione locale", { steps: [{ role: "ops", task: "nota interna" }] });
    const rep = await agency.run(ag.id, { workspace: ws });
    assert.equal(rep.ok, true);
    assert.equal(rep.done, 1);
    assert.equal(rep.fail, 0);
    assert.equal(rep.steps.length, 1);
    assert.equal(rep.steps[0]?.ok, true);

    const task = board.list()[0];
    assert.ok(task);
    assert.equal(task.status, "done");

    const after = agency.get(ag.id);
    assert.ok(after);
    assert.equal(after.status, "done");
    assert.equal(after.steps[0]?.status, "done");
  });

  it("run su id inesistente: ko senza throw", async () => {
    const rep = await agency.run("agy-inesistente", { workspace: ws });
    assert.equal(rep.ok, false);
    assert.equal(rep.done, 0);
  });

  it("status riporta agenzie e coda del workboard", async () => {
    const ag = await agency.create("stato", { steps: [{ role: "ops", task: "x" }] });
    const st = agency.status(ag.id);
    assert.equal(st.ok, true);
    assert.equal(st.agencies.length, 1);
    assert.equal(st.agencies[0]?.id, ag.id);
    assert.equal(st.board?.counts.queued, 1);
    assert.equal(agency.status().agencies.length, 1);
  });

  it("tool agency: create pianifica, run esige conferma", async () => {
    const created = await runTool({
      name: "agency.create",
      args: { goal: "ciclo via tool", steps: [{ role: "ops", task: "noop" }] },
    });
    assert.equal(created.ok, true);
    const id = (created.data as { id: string }).id;
    assert.ok(id.startsWith("agy-"));

    const proposed = await runTool({ name: "agency.run", args: { id, workspace: ws } });
    assert.equal(proposed.ok, false);
    assert.equal(proposed.needsConfirm, true);

    const ran = await runTool({ name: "agency.run", args: { id, workspace: ws, confirm: true } });
    assert.equal(ran.ok, true);
    const rep = ran.data as { done: number; fail: number };
    assert.equal(rep.done, 1);
    assert.equal(rep.fail, 0);

    const st = await runTool({ name: "agency.status", args: { id } });
    assert.equal(st.ok, true);
  });
});
