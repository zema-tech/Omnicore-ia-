// Test dipendenza umana: azioni rischiose registrate, eseguite solo su "approvo <id>".
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approvalRequest, approvalsOpen } from "../src/modules/permissions.ts";
import { runAgent } from "../src/agent/loop.ts";

let dir = "";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env["OMNICORE_APPROVALS_FILE"];
  dir = mkdtempSync(join(tmpdir(), "approval-test-"));
  process.env["OMNICORE_APPROVALS_FILE"] = join(dir, "approvals.json");
});

afterEach(() => {
  if (saved === undefined) delete process.env["OMNICORE_APPROVALS_FILE"];
  else process.env["OMNICORE_APPROVALS_FILE"] = saved;
  rmSync(dir, { recursive: true, force: true });
});

describe("approval flow", () => {
  it("richiesta code senza conferma: approval registrata con id in reply", async () => {
    const r = await runAgent("cancella il file vecchi-cache.tmp");
    const blocked = r.trace.find((t) => !t.ok && (t.error ?? "").includes("in attesa di approvazione appr-"));
    assert.ok(blocked, `trace: ${JSON.stringify(r.trace.map((t) => t.error))}`);
    const id = (blocked!.error as string).match(/appr-[\w-]+/)![0];
    assert.ok(r.reply.includes(id));
    assert.equal(approvalsOpen().length, 1);
  });

  it("'approvo <id>' esegue l'azione registrata (sicura)", async () => {
    const req = approvalRequest("memory.note_search", "note sul deploy", "test", {
      name: "memory.note_search",
      args: { query: "deploy" },
    });
    const r = await runAgent(`approvo ${req.id}`);
    assert.ok(r.reply.includes("Approvato ed eseguito"));
    assert.ok(r.trace.some((t) => t.name === "memory.note_search" && t.ok));
    assert.equal(approvalsOpen().length, 0);
  });

  it("doppia approvazione negata", async () => {
    const req = approvalRequest("memory.note_search", "x", "test", { name: "memory.note_search", args: {} });
    await runAgent(`approvo ${req.id}`);
    const r2 = await runAgent(`approvo ${req.id}`);
    assert.ok(r2.reply.includes("già stata decisa"));
  });

  it("'nego <id>' archivia senza eseguire", async () => {
    const req = approvalRequest("code.shell", "rm roba", "test", { name: "code.shell", args: { cmd: "echo MAI" } });
    const r = await runAgent(`nego ${req.id}`);
    assert.ok(r.reply.includes("negata"));
    assert.ok(!r.trace.some((t) => t.name === "code.shell"));
  });

  it("id sconosciuto: nessun effetto", async () => {
    const r = await runAgent("approvo appr-inesistente-123");
    assert.ok(r.reply.includes("Non trovo"));
  });
});
