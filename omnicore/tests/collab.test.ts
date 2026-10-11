// Test collaborazione: presence heartbeat + share ACL + tool.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collab } from "../src/modules/collab.ts";
import { runTool } from "../src/agent/tools.ts";

let dir = "";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ["OMNICORE_PRESENCE_FILE", "OMNICORE_SHARES_FILE"]) saved[k] = process.env[k];
  dir = mkdtempSync(join(tmpdir(), "collab-test-"));
  process.env["OMNICORE_PRESENCE_FILE"] = join(dir, "presence.json");
  process.env["OMNICORE_SHARES_FILE"] = join(dir, "shares.json");
});

afterEach(() => {
  for (const k of ["OMNICORE_PRESENCE_FILE", "OMNICORE_SHARES_FILE"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("presence", () => {
  it("ping upsert + lista ordinata", () => {
    collab.ping("ana", "review");
    collab.ping("zem", "deploy");
    const list = collab.online();
    assert.equal(list.length, 2);
    assert.ok(list.every((e) => !e.stale));
    assert.ok(list.some((e) => e.user === "ana" && e.doing === "review"));
    const again = collab.ping("ana", "altro");
    assert.equal(again.online, 2);
  });
  it("utente invalido rifiutato", () => {
    assert.throws(() => collab.ping("nome sbagliato!!"));
  });
});

describe("share ACL", () => {
  it("primo grant = owner, poi solo owner cambia", () => {
    const g = collab.grant("s1", "ana", "owner");
    assert.equal(g.role, "owner");
    collab.grant("s1", "zem", "editor", "ana");
    assert.equal(collab.check("s1", "zem").role, "editor");
    assert.equal(collab.check("s1", "x").role, "none");
    assert.throws(() => collab.grant("s1", "bob", "viewer", "zem"));
    collab.grant("s1", "bob", "viewer", "ana");
    assert.equal(collab.check("s1", "bob").role, "viewer");
  });
  it("passaggio owner e revoke", () => {
    collab.grant("s2", "ana", "owner");
    collab.grant("s2", "zem", "owner", "ana");
    assert.equal(collab.check("s2", "zem").role, "owner");
    assert.throws(() => collab.revoke("s2", "zem", "zem"));
    collab.grant("s2", "bob", "editor", "zem");
    assert.deepEqual(collab.revoke("s2", "bob", "zem"), { revoked: "bob" });
    assert.equal(collab.check("s2", "bob").role, "none");
  });
  it("ruolo invalido e self-handoff implicito", () => {
    assert.throws(() => collab.grant("s3", "ana", "superuser"));
  });
});

describe("collab nei tool", () => {
  it("ping/list/grant/check via tool", async () => {
    const p = await runTool({ name: "presence.ping", args: { user: "ana" } });
    assert.equal(p.ok, true);
    const l = await runTool({ name: "presence.list", args: {} });
    assert.equal((l.data as any[]).length, 1);
    const g = await runTool({ name: "share.grant", args: { session: "s9", user: "ana", role: "owner" } });
    assert.equal(g.ok, true);
    const c = await runTool({ name: "share.check", args: { session: "s9", user: "ana" } });
    assert.equal((c.data as any).role, "owner");
  });
});
