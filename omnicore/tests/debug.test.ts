// Test DAP: adapter finto con framing reale, flusso attach/break/go/vars.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { dap } from "../../packages/code/src/dap.ts";
import { runTool } from "../src/agent/tools.ts";

const ADAPTER = `let b=Buffer.alloc(0);
function send(o){const t=Buffer.from(JSON.stringify(o));process.stdout.write(Buffer.concat([Buffer.from('Content-Length: '+t.length+'\\r\\n\\r\\n'),t]));}
process.stdin.on('data',(d)=>{b=Buffer.concat([b,d]);for(;;){const h=b.indexOf('\\r\\n\\r\\n');if(h<0)return;
const m=b.slice(0,h).toString().match(/Content-Length:\\s*(\\d+)/i);if(!m){b=b.slice(h+4);continue}
const n=+m[1];if(b.length<h+4+n)return;const msg=JSON.parse(b.slice(h+4,h+4+n).toString());b=b.slice(h+4+n);
if(msg.type!=='request')continue;const c=msg.command;let body={};
if(c==='initialize')body={supportsConfigurationDoneRequest:true};
else if(c==='setBreakpoints')body={breakpoints:[{verified:true,line:5}]};
else if(c==='threads')body={threads:[{id:1,name:'main'}]};
else if(c==='stackTrace')body={stackFrames:[{id:11,name:'f',line:5}]};
else if(c==='scopes')body={scopes:[{variablesReference:21}]};
else if(c==='variables')body={variables:[{name:'x',value:'42'}]};
else if(c==='continue')body={allThreadsContinued:true};
send({seq:1,type:'response',request_seq:msg.seq,command:c,success:true,body});}});`;

const KEYS = ["OMNICORE_DAP_TIMEOUT_MS"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env["OMNICORE_DAP_TIMEOUT_MS"] = "5000";
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("dap client", () => {
  it("attach + break + go + vars contro adapter finto", async () => {
    const a = await dap.attach({ command: "node", args: ["-e", ADAPTER] });
    assert.equal(a.ok, true, JSON.stringify(a).slice(0, 200));
    const sid = a.session!;
    const b = await dap.break(sid, "x.ts", 5);
    assert.equal(b.ok, true);
    assert.equal((b.breakpoints as any[])[0].verified, true);
    const g = await dap.go(sid, "continue");
    assert.equal(g.ok, true);
    const v = await dap.vars(sid, 21);
    assert.equal((v.variables as any[])[0].value, "42");
    assert.equal(dap.detach(sid).closed, true);
  });
  it("binario assente e sessione ignota: errori onesti", async () => {
    const a = await dap.attach({ command: "/nonexistent-dap-xyz" });
    assert.equal(a.ok, false);
    assert.equal((await dap.break("nope", "x", 1)).ok, false);
    assert.equal((await dap.go("nope", "continue")).ok, false);
    assert.equal((await dap.vars("nope", 1)).ok, false);
    assert.equal(dap.detach("nope").closed, false);
  });
});

describe("debug nei tool", () => {
  it("attach chiede conferma, break/vars liberi", async () => {
    const c = await runTool({ name: "debug.attach", args: { command: "node" } });
    assert.equal(c.needsConfirm, true);
    const b = await runTool({ name: "debug.break", args: { session: "nope", file: "x", line: 1 } });
    assert.equal(b.ok, false);
    assert.match(b.error!, /non trovata/);
  });
});
