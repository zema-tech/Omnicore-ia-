// Test STT: whisper finto, OpenAI finto, validazione WAV, meeting.attach.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stt } from "../src/modules/stt.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["WHISPER_BIN", "WHISPER_MODEL", "OPENAI_API_KEY", "OPENAI_API_BASE",
  "OPENAI_STT_MODEL", "OMNICORE_STT_TIMEOUT_MS", "OMNICORE_MEETINGS_FILE", "OMNICORE_VAULT_DIR"];
let saved: Record<string, string | undefined> = {};
let fake: Server | null = null;
let dir = "";
let wav = "";

const WHISPER_FAKE = `console.log('[00:00:01.000 --> 00:00:02.000]  ciao mondo dalla riunione');console.log('whisper_init: ok');`;

function makeWav(): string {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36, 4);
  h.write("WAVE", 8);
  const p = join(dir, "a.wav");
  writeFileSync(p, Buffer.concat([h, Buffer.alloc(100)]));
  return p;
}

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), "stt-test-"));
  wav = makeWav();
  process.env["OMNICORE_MEETINGS_FILE"] = join(dir, "meetings.json");
  process.env["OMNICORE_VAULT_DIR"] = join(dir, "vault");
});

afterEach(async () => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true });
  if (fake) {
    await new Promise<void>((res) => fake!.close(() => res()));
    fake = null;
  }
});

function startOpenAI(): Promise<string> {
  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if ((req.headers["authorization"] ?? "") !== "Bearer K") {
        res.writeHead(401);
        res.end(JSON.stringify({ error: { message: "bad key" } }));
        return;
      }
      res.end(JSON.stringify({ text: "trascrizione cloud di prova" }));
    });
  });
  return new Promise<string>((res) => fake!.listen(0, "127.0.0.1", () => {
    res(`http://127.0.0.1:${(fake!.address() as any).port}`);
  }));
}

describe("stt", () => {
  it("niente setup: errore onesto con entrambe le strade", async () => {
    const r = await stt.transcribe(wav);
    assert.equal(r.ok, false);
    assert.match(r.error!, /WHISPER_BIN.*OPENAI_API_KEY|OPENAI_API_KEY.*WHISPER/i);
  });
  it("file assente o non-wav: errori onesti", async () => {
    assert.equal((await stt.transcribe(join(dir, "no.wav"))).ok, false);
    const txt = join(dir, "x.txt");
    writeFileSync(txt, "non audio");
    assert.match((await stt.transcribe(txt)).error!, /WAV/i);
  });
  it("whisper finto: timestamp strippati", async () => {
    const bin = join(dir, "whisper-fake");
    writeFileSync(bin, "#!/bin/sh\necho '[00:00:01.000 --> 00:00:02.000]  ciao mondo dalla riunione'\necho 'whisper_init: ok' >&2\nexit 0\n");
    chmodSync(bin, 0o755);
    process.env["WHISPER_BIN"] = bin;
    process.env["WHISPER_MODEL"] = "fake.bin";
    const r = await stt.transcribe(wav);
    assert.equal(r.ok, true, r.error ?? "");
    assert.equal(r.text, "ciao mondo dalla riunione");
  });
  it("openai finto: testo tornato", async () => {
    process.env["OPENAI_API_BASE"] = await startOpenAI();
    process.env["OPENAI_API_KEY"] = "K";
    const r = await stt.transcribe(wav, { provider: "openai" });
    assert.equal(r.ok, true);
    assert.equal(r.text, "trascrizione cloud di prova");
  });
});

describe("meeting.attach", () => {
  it("trascrive e appende segmenti", async () => {
    process.env["OPENAI_API_BASE"] = await startOpenAI();
    process.env["OPENAI_API_KEY"] = "K";
    const s = await runTool({ name: "meeting.start", args: { title: "Standup" } });
    const id = (s.data as any).id;
    const a = await runTool({ name: "meeting.attach", args: { id, file: wav, who: "ana" } });
    assert.equal(a.ok, true, JSON.stringify(a).slice(0, 200));
    assert.equal((a.data as any).segments, 1);
    const st = await runTool({ name: "meeting.status", args: { id } });
    assert.ok(String((st.data as any).markdown).includes("trascrizione cloud"));
  });
});
