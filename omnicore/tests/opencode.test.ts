// Test fusione OpenCode: edit con diff, glob/grep, todo, piano keyword.
// Workspace e todos isolati su dir temporanee.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { edit } from "../src/modules/edit.ts";
import { search } from "../src/modules/search.ts";
import { todos } from "../src/modules/todo.ts";
import { runTool } from "../src/agent/tools.ts";
import { planKeyword } from "../src/agent/plan.ts";

let dir = "";
let saved: Record<string, string | undefined> = {};
const KEYS = ["OMNICORE_WORKSPACE", "OMNICORE_TODOS_FILE"];

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), "coding-test-"));
  process.env["OMNICORE_WORKSPACE"] = dir;
  process.env["OMNICORE_TODOS_FILE"] = join(dir, "todos.json");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "app.ts"), "const x = 1;\nconsole.log(x);\n");
  writeFileSync(join(dir, "README.md"), "# demo\nTODO: finire\n");
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("edit", () => {
  it("preview mostra diff senza scrivere", () => {
    const p = edit.preview("src/app.ts", "const x = 1;", "const x = 2;");
    assert.equal(p.ok, true);
    assert.ok(p.diff.includes("- const x = 1;"));
    assert.ok(p.diff.includes("+ const x = 2;"));
  });
  it("apply scrive davvero", () => {
    const r = edit.apply("src/app.ts", "const x = 1;", "const x = 42;");
    assert.equal(r.ok, true);
    const p2 = edit.preview("src/app.ts", "const x = 1;", "y");
    assert.equal(p2.ok, false); // non c'è più
  });
  it("testo assente o escape: errore onesto", () => {
    assert.equal(edit.preview("src/app.ts", "inesistente-xyz", "y").ok, false);
    assert.match(edit.apply("../fuori.txt", "a", "b").output, /fuori dal workspace/);
  });
});

describe("search", () => {
  it("glob trova per pattern", () => {
    const r = search.glob("src/*.ts");
    assert.equal(r.ok, true);
    assert.ok(r.output.includes("src/app.ts"));
  });
  it("grep trova riga e numero", () => {
    const r = search.grep("TODO");
    assert.equal(r.ok, true);
    assert.ok(r.hits.some((h) => h.file === "README.md" && h.line === 2));
  });
  it("regex invalida: errore, non throw", () => {
    assert.equal(search.grep("([invalid").ok, false);
  });
});

describe("todo", () => {
  it("add/list/done/clear", () => {
    const t = todos.add("primo passo");
    assert.equal(todos.list().length, 1);
    assert.equal(todos.set(t.id, "done"), true);
    assert.equal(todos.set("inesistente", "done"), false);
    assert.equal(todos.clear(), 1);
    assert.equal(todos.list().length, 0);
  });
});

describe("tools coding", () => {
  it("code.edit preview via tool", async () => {
    const r = await runTool({ name: "code.edit", args: { path: "src/app.ts", oldText: "const x = 1;", newText: "const x = 9;" } });
    assert.equal(r.ok, true);
    assert.ok(String(r.data).includes("+ const x = 9;"));
  });
  it("code.edit apply senza conferma chiede conferma", async () => {
    const r = await runTool({ name: "code.edit", args: { path: "src/app.ts", oldText: "a", newText: "b", apply: true } });
    assert.equal(r.needsConfirm, true);
  });
  it("keyword pianifica grep diretto", () => {
    const p = planKeyword("cerca TODO nei file");
    assert.ok(p.calls.some((c) => c.name === "code.grep"));
  });
});
