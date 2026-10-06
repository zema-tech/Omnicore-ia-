// Test mani native: jail, blocklist, timeout, routing code.run.
// Root isolata via OMNICORE_WORKSPACE temporanea. Nessun vendor toccato.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, listDir, runShell, isBlocked } from "../src/faculties/native_fs.ts";
import { run as codeRun, parseLocalTask } from "../src/faculties/code.ts";
import { runTool } from "../src/agent/tools.ts";

let dir = "";
let savedWs: string | undefined;
let savedTimeout: string | undefined;

beforeEach(() => {
  savedWs = process.env["OMNICORE_WORKSPACE"];
  savedTimeout = process.env["OMNICORE_SHELL_TIMEOUT_MS"];
  dir = mkdtempSync(join(tmpdir(), "nativo-test-"));
  process.env["OMNICORE_WORKSPACE"] = dir;
});

afterEach(() => {
  if (savedWs === undefined) delete process.env["OMNICORE_WORKSPACE"];
  else process.env["OMNICORE_WORKSPACE"] = savedWs;
  if (savedTimeout === undefined) delete process.env["OMNICORE_SHELL_TIMEOUT_MS"];
  else process.env["OMNICORE_SHELL_TIMEOUT_MS"] = savedTimeout;
  rmSync(dir, { recursive: true, force: true });
});

describe("native_fs", () => {
  it("write + read roundtrip", () => {
    assert.equal(writeFile("a/b.txt", "ciao").ok, true);
    const r = readFile("a/b.txt");
    assert.equal(r.ok, true);
    assert.equal(r.output, "ciao");
    assert.equal(r.via, "code(native-read)");
  });
  it("path escape negato", () => {
    assert.match(writeFile("../../fuori.txt", "x").output, /fuori dal workspace/);
    assert.match(readFile("../../etc/passwd").output, /fuori dal workspace/);
    assert.match(listDir("..").output, /fuori dal workspace/);
  });
  it("listDir elenca", () => {
    writeFileSync(join(dir, "uno.txt"), "1");
    const l = listDir(".");
    assert.equal(l.ok, true);
    assert.ok(l.output.includes("uno.txt"));
  });
  it("shell echo ok", async () => {
    const r = await runShell("echo ciao-mondo");
    assert.equal(r.ok, true);
    assert.ok(r.output.includes("ciao-mondo"));
    assert.equal(r.via, "code(native-shell)");
  });
  it("blocklist nega rm -rf / e simili", async () => {
    assert.ok(isBlocked("rm -rf /") !== null);
    assert.ok(isBlocked("dd if=/dev/zero of=/dev/sda") !== null);
    assert.ok(isBlocked("shutdown now") !== null);
    const r = await runShell("rm -rf /");
    assert.equal(r.ok, false);
    assert.match(r.output, /bloccato/);
  });
  it("timeout kill soft", async () => {
    const r = await runShell("sleep 10 && echo tardi", { timeoutMs: 400 });
    assert.equal(r.ok, false);
    assert.match(r.output, /timeout dopo 400ms/);
  });
});

describe("code.run routing", () => {
  it("'leggi il file' -> native-read", async () => {
    writeFile("doc.txt", "contenuto-segreto");
    const r = await codeRun("leggi il file doc.txt");
    assert.equal(r.via, "code(native-read)");
    assert.equal(r.output, "contenuto-segreto");
  });
  it("'scrivi file con contenuto' -> native-write", async () => {
    const r = await codeRun("scrivi il file ciao.txt con contenuto: buongiorno");
    assert.equal(r.via, "code(native-write)");
    assert.equal(r.ok, true);
    assert.equal(readFile("ciao.txt").output, "buongiorno");
  });
  it("task generico -> fallback OpenCode (via opencode*)", async () => {
    const t = parseLocalTask("rifattorizza il modulo auth con i nuovi requisiti");
    assert.equal(t, null);
  });
});

describe("tools code.*", () => {
  it("code.read legge", async () => {
    writeFile("r.txt", "abc");
    const r = await runTool({ name: "code.read", args: { path: "r.txt" } });
    assert.equal(r.ok, true);
    assert.equal(r.data, "abc");
  });
  it("code.write senza conferma chiede conferma", async () => {
    const r = await runTool({ name: "code.write", args: { path: "x.txt", content: "y" } });
    assert.equal(r.ok, false);
    assert.equal(r.needsConfirm, true);
  });
  it("code.shell senza conferma chiede conferma", async () => {
    const r = await runTool({ name: "code.shell", args: { cmd: "echo hi" } });
    assert.equal(r.ok, false);
    assert.equal(r.needsConfirm, true);
  });
});
