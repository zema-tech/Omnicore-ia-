// Test vault: save/search/link/recall su dir temporanea (mai il vault vero).
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveNote, searchNotes, linkNotes, recallFor } from "../src/vault/notes.ts";

let dir = "";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env["OMNICORE_VAULT_DIR"];
  dir = mkdtempSync(join(tmpdir(), "vault-test-"));
  process.env["OMNICORE_VAULT_DIR"] = dir;
});

afterEach(() => {
  if (saved === undefined) delete process.env["OMNICORE_VAULT_DIR"];
  else process.env["OMNICORE_VAULT_DIR"] = saved;
  rmSync(dir, { recursive: true, force: true });
});

describe("vault", () => {
  it("save + search ritrova la nota", () => {
    const f = saveNote("Deploy Atlas", "Procedura deploy semplice con un solo comando.");
    assert.ok(f.endsWith(".md"));
    const hits = searchNotes("procedura deploy atlas");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].title, "Deploy Atlas");
  });
  it("nota vuota rifiutata", () => {
    assert.throws(() => saveNote("  ", "  "));
  });
  it("link aggiunge [[tag]] e recall espande l'hop", () => {
    const f = saveNote("Turni Notte", "Copertura notturna del team.");
    saveNote("Team Atlas", "Il team segue i deploy.");
    const base = f.split("/").pop()!;
    assert.equal(linkNotes(base, "Team Atlas"), true);
    assert.equal(linkNotes(base, "Team Atlas"), false); // idempotente
    const ctx = recallFor("copertura notturna turni");
    assert.ok(ctx.includes("Turni Notte"));
    assert.ok(ctx.includes("Team Atlas")); // via [[link]]
  });
  it("path traversal neutralizzato", () => {
    const f = saveNote("../../fuori", "corpo");
    assert.ok(!f.includes(".."));
    assert.ok(f.startsWith(dir));
  });
});
