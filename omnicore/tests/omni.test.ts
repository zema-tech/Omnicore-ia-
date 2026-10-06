// Test parser OmniLang — AST reale dall'esempio hello.omni.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../omniling/ts/parser.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("omniling.parser", () => {
  it("parsa system/tool con forma systems/tools/flows", () => {
    const ast = parse('system test: memory via "bridge"\n') as any;
    assert.ok(Array.isArray(ast.systems));
    assert.equal(ast.systems[0].name, "test");
    assert.equal(ast.systems[0].via, "bridge");
  });
  it("parsa l'esempio reale hello.omni senza errori", () => {
    const src = readFileSync(join(HERE, "..", "omniling", "examples", "hello.omni"), "utf8");
    const ast = parse(src) as any;
    assert.ok(ast.systems.length >= 1);
    assert.ok(ast.tools.length >= 1);
    assert.ok(Array.isArray(ast.flows));
  });
  it("rifiuta sintassi rotta con throw", () => {
    assert.throws(() => parse("tool senza due punti e indentazione \n   ???  "));
  });
});
