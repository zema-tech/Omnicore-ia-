// Test code intelligence: indice simboli, definition, references, LSP-stdio finto.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexSymbols, findDefinition, findReferences } from "../../packages/code/src/symbols.ts";
import { lsp } from "../../packages/code/src/lsp.ts";
import { runTool } from "../src/agent/tools.ts";

let ws = "";
const saved: Record<string, string | undefined> = {};

const TS = `export function somma(a: number, b: number) {
  return a + b;
}
export class Calcolatrice {
  totale = 0;
  aggiungi(x: number) {
    this.totale += x;
  }
}
const risultato = somma(1, 2);
`;
const PY = `def saluta(nome):
    return "ciao " + nome

class Voce:
    def parla(self):
        return saluta("mondo")
`;

beforeEach(() => {
  for (const k of ["OMNICORE_WORKSPACE"]) saved[k] = process.env[k];
  ws = mkdtempSync(join(tmpdir(), "codeintel-test-"));
  process.env["OMNICORE_WORKSPACE"] = ws;
  writeFileSync(join(ws, "mate.ts"), TS);
  writeFileSync(join(ws, "voce.py"), PY);
  mkdirSync(join(ws, "node_modules"));
  writeFileSync(join(ws, "node_modules", "ignora.js"), "function nascosta() {}");
});

afterEach(() => {
  for (const k of ["OMNICORE_WORKSPACE"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(ws, { recursive: true, force: true });
});

describe("symbols index", () => {
  it("trova funzioni/classi ts+py, salta node_modules", () => {
    const r = indexSymbols(ws);
    assert.equal(r.ok, true);
    const names = r.symbols.map((s) => s.name);
    assert.ok(names.includes("somma"));
    assert.ok(names.includes("Calcolatrice"));
    assert.ok(names.includes("saluta"));
    assert.ok(names.includes("Voce"));
    assert.ok(!names.includes("nascosta"));
    assert.ok(r.symbols.find((s) => s.name === "somma")!.exported);
  });
  it("definition preferisce export, references trova usi", () => {
    const d = findDefinition("somma", ws);
    assert.equal(d.ok, true);
    assert.equal(d.defs[0].file, "mate.ts");
    const refs = findReferences("somma", ws);
    assert.equal(refs.ok, true);
    assert.ok(refs.refs.length >= 2);
    assert.ok(refs.refs.some((x) => x.text.includes("somma(1, 2)")));
    const no = findDefinition("inesistente_xyz", ws);
    assert.equal(no.ok, false);
  });
});

describe("lsp stdio", () => {
  it("definition contro server finto con framing Content-Length", async () => {
    const script = `let b=Buffer.alloc(0);
process.stdin.on('data',(d)=>{b=Buffer.concat([b,d]);for(;;){const h=b.indexOf('\\r\\n\\r\\n');if(h<0)return;
const m=b.slice(0,h).toString().match(/Content-Length:\\s*(\\d+)/i);if(!m){b=b.slice(h+4);continue}
const n=+m[1];if(b.length<h+4+n)return;const msg=JSON.parse(b.slice(h+4,h+4+n).toString());b=b.slice(h+4+n);
if(msg.id===undefined)continue;let r=null;
if(msg.method==='initialize')r={capabilities:{}};
else if(msg.method==='textDocument/definition')r=[{uri:'file://${ws}/mate.ts',range:{start:{line:0,character:16}}}];
const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:r}));process.stdout.write(Buffer.concat([Buffer.from('Content-Length: '+body.length+'\\r\\n\\r\\n'),body]));}});`;
    const r = await lsp.definition("mate.ts", { line: 8, character: 20 }, {
      command: "node", args: ["-e", script], root: ws, timeoutMs: 5000,
    });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
    assert.equal(r.locations[0].line, 0);
  });
  it("binario assente: errore onesto", async () => {
    const r = await lsp.definition("x.ts", { line: 0, character: 0 }, {
      command: "omnicore-lsp-che-non-esiste-xyz", root: ws, timeoutMs: 2000,
    });
    assert.equal(r.ok, false);
  });
});

describe("code intelligence nei tool", () => {
  it("code.symbols/definition via tool sul workspace", async () => {
    const s = await runTool({ name: "code.symbols", args: {} }, { directory: ws });
    assert.equal(s.ok, true);
    assert.ok((s.data as any[]).some((x) => x.name === "Calcolatrice"));
    const d = await runTool({ name: "code.definition", args: { symbol: "saluta" } }, { directory: ws });
    assert.equal(d.ok, true);
    assert.equal((d.data as any[])[0].file, "voce.py");
    const e = await runTool({ name: "code.definition", args: {} }, { directory: ws });
    assert.equal(e.ok, false);
  });
  it("code.lsp senza conferma: proposto", async () => {
    const r = await runTool({ name: "code.lsp", args: { command: "x", file: "y" } });
    assert.equal(r.ok, false);
    assert.equal(r.needsConfirm, true);
  });
});
