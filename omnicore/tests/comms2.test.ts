// Test WhatsApp Cloud + Email: REST finta, parser, SMTP/IMAP finti via TCP.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttp, type Server as HttpServer } from "node:http";
import { createServer as createTcp, type Server as TcpServer, type Socket } from "node:net";
import { whatsapp } from "../src/modules/whatsapp.ts";
import { email } from "../src/modules/email.ts";
import { channelSend } from "../src/modules/channels.ts";
import { runTool } from "../src/agent/tools.ts";

const KEYS = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_API_BASE", "WHATSAPP_VERIFY_TOKEN",
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM",
  "IMAP_HOST", "IMAP_PORT", "IMAP_SECURE", "IMAP_USER", "IMAP_PASS",
  "OMNICORE_EMAIL_TIMEOUT_MS", "OMNICORE_EMAIL_INSECURE"];
let saved: Record<string, string | undefined> = {};
let http: HttpServer | null = null;
let smtp: TcpServer | null = null;
let imap: TcpServer | null = null;
let waPosts: any[] = [];
let smtpGot: string[] = [];

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  waPosts = [];
  smtpGot = [];
  process.env["OMNICORE_EMAIL_INSECURE"] = "1"; // rete lab: niente TLS nei finti
});

afterEach(async () => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  for (const s of [http, smtp, imap]) {
    if (s) await new Promise<void>((res) => s!.close(() => res()));
  }
  http = smtp = imap = null;
});

function startWa(): Promise<string> {
  http = createHttp((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if ((req.headers["authorization"] ?? "") !== "Bearer W") {
        res.writeHead(401);
        res.end(JSON.stringify({ error: { message: "bad token" } }));
        return;
      }
      waPosts.push(JSON.parse(body || "{}"));
      res.end(JSON.stringify({ messages: [{ id: "w1" }] }));
    });
  });
  return new Promise<string>((res) => http!.listen(0, "127.0.0.1", () => {
    res(`http://127.0.0.1:${(http!.address() as any).port}`);
  }));
}

describe("whatsapp", () => {
  it("senza config: errore onesto", async () => {
    assert.equal((await whatsapp.send("+39123", "x")).ok, false);
  });
  it("send a numero con +, parser webhook e verify", async () => {
    process.env["WHATSAPP_API_BASE"] = await startWa();
    process.env["WHATSAPP_TOKEN"] = "W";
    process.env["WHATSAPP_PHONE_ID"] = "99";
    const r = await whatsapp.send("+39123456", "ciao wa");
    assert.equal(r.ok, true);
    assert.equal(waPosts[0].to, "+39123456");
    assert.equal(waPosts[0].text.body, "ciao wa");
    const bad = await whatsapp.send("39123456", "x");
    assert.equal(bad.ok, false); // senza + rifiutato
    const inbound = whatsapp.parse({ entry: [{ changes: [{ value: { messages: [{ id: "m1", from: "39111", type: "text", text: { body: "ciao" } }] } }] }] });
    assert.equal(inbound[0].text, "ciao");
    assert.deepEqual(whatsapp.parse({}), []);
    process.env["WHATSAPP_VERIFY_TOKEN"] = "V";
    assert.equal(whatsapp.verify({ "hub.mode": "subscribe", "hub.verify_token": "V", "hub.challenge": "C" }).challenge, "C");
    assert.deepEqual(whatsapp.verify({ "hub.mode": "subscribe", "hub.verify_token": "NO" }), {});
  });
  it("channelSend a numero con +", async () => {
    process.env["WHATSAPP_API_BASE"] = await startWa();
    process.env["WHATSAPP_TOKEN"] = "W";
    process.env["WHATSAPP_PHONE_ID"] = "99";
    const r = await channelSend("ciao", ["whatsapp", "+39123456"]);
    assert.equal(r.ok, true, r.detail);
  });
  it("tool chiede conferma", async () => {
    const r = await runTool({ name: "whatsapp.send", args: { to: "+391", text: "x" } });
    assert.equal(r.needsConfirm, true);
  });
});

function startSmtp(): Promise<number> {
  smtp = createTcp((s: Socket) => {
    s.write("220 fake ESMTP\r\n");
    let stage = 0;
    let buf = "";
    s.on("data", (d) => {
      buf += String(d);
      const lines = buf.split("\r\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        if (stage === 0 && line.startsWith("EHLO")) {
          s.write("250-HELLO\r\n250 AUTH LOGIN\r\n");
          stage = 1;
        } else if (stage === 1 && line === "STARTTLS") {
          s.write("220 go ahead\r\n");
          stage = 2;
        } else if (stage === 2 && line === "AUTH LOGIN") {
          s.write("334 VXNlcm5hbWU6\r\n");
          stage = 3;
        } else if (stage === 3) {
          s.write("334 UGFzc3dvcmQ6\r\n");
          stage = 4;
        } else if (stage === 4) {
          s.write("235 ok\r\n");
          stage = 5;
        } else if (stage === 5 && line.startsWith("MAIL FROM")) {
          s.write("250 ok\r\n");
          stage = 6;
        } else if (stage === 6 && line.startsWith("RCPT TO")) {
          s.write("250 ok\r\n");
          stage = 7;
        } else if (stage === 7 && line === "DATA") {
          s.write("354 end with dot\r\n");
          stage = 8;
        } else if (stage === 8) {
          smtpGot.push(line);
          if (line === ".") {
            s.write("250 queued\r\n");
            stage = 9;
          }
        } else if (line === "QUIT") {
          s.write("221 bye\r\n");
          s.end();
        }
      }
    });
  });
  return new Promise<number>((res) => smtp!.listen(0, "127.0.0.1", () => res((smtp!.address() as any).port)));
}

function startImap(): Promise<number> {
  imap = createTcp((s: Socket) => {
    s.write("* OK fake ready\r\n");
    let buf = "";
    s.on("data", (d) => {
      buf += String(d);
      const lines = buf.split("\r\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        const m = line.match(/^(a\d+)\s+(\w+)(.*)$/);
        if (!m) continue;
        const [, tag, cmd] = m;
        if (cmd === "CAPABILITY") s.write("* CAPABILITY IMAP4rev1 STARTTLS AUTH=PLAIN\r\n" + tag + " OK done\r\n");
        else if (cmd === "LOGIN") s.write(tag + " OK logged in\r\n");
        else if (cmd === "SELECT") s.write("* 2 EXISTS\r\n" + tag + " OK selected\r\n");
        else if (cmd === "SEARCH") s.write("* SEARCH 1 2\r\n" + tag + " OK done\r\n");
        else if (cmd === "FETCH") {
          const id = line.match(/FETCH (\d+)/)?.[1] ?? "?";
          const hdr = `From: ana@x.it\r\nSubject: Prova ${id}\r\nDate: Mon, 01 Jan 2026\r\n`;
          const txt = `corpo messaggio ${id} con dettagli`;
          s.write(`* ${id} FETCH (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {${hdr.length}}\r\n${hdr}\r\n BODY[TEXT]<0> {${txt.length}}\r\n${txt}\r\n)\r\n${tag} OK done\r\n`);
        } else if (cmd === "LOGOUT") {
          s.write("* BYE\r\n" + tag + " OK bye\r\n");
          s.end();
        }
      }
    });
  });
  return new Promise<number>((res) => imap!.listen(0, "127.0.0.1", () => res((imap!.address() as any).port)));
}

function mailEnv(smtpPort: number, imapPort: number): void {
  process.env["SMTP_HOST"] = "127.0.0.1";
  process.env["SMTP_PORT"] = String(smtpPort);
  process.env["SMTP_SECURE"] = "0";
  process.env["SMTP_USER"] = "u";
  process.env["SMTP_PASS"] = "p";
  process.env["SMTP_FROM"] = "u@x.it";
  process.env["IMAP_HOST"] = "127.0.0.1";
  process.env["IMAP_PORT"] = String(imapPort);
  process.env["IMAP_SECURE"] = "0";
  process.env["IMAP_USER"] = "u";
  process.env["IMAP_PASS"] = "p";
}

describe("email smtp", () => {
  it("senza config: errore onesto", async () => {
    assert.equal((await email.send("a@b.it", "s", "t")).ok, false);
    assert.equal((await email.read()).ok, false);
  });
  it("invio completo con AUTH", async () => {
    mailEnv(await startSmtp(), 1);
    const r = await email.send("dest@x.it", "Oggetto", "corpo email");
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
    assert.ok(smtpGot.join("\n").includes("corpo email"));
  });
  it("tool chiede conferma", async () => {
    const r = await runTool({ name: "email.send", args: { to: "a@b.it", subject: "s", text: "t" } });
    assert.equal(r.needsConfirm, true);
  });
});

describe("email imap", () => {
  it("legge unseen con mittente/oggetto/snippet", async () => {
    mailEnv(1, await startImap());
    const r = await email.read({ limit: 5 });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200));
    assert.equal(r.data!.messages.length, 2);
    assert.equal(r.data!.messages[0].subject, "Prova 2");
    assert.equal(r.data!.messages[0].from, "ana@x.it");
    assert.ok(r.data!.messages[0].snippet.includes("corpo messaggio 2"));
  });
  it("tool email.read nel loop", async () => {
    mailEnv(1, await startImap());
    const r = await runTool({ name: "email.read", args: { limit: 1 } });
    assert.equal(r.ok, true);
    assert.equal((r.data as any).messages.length, 1);
  });
});
