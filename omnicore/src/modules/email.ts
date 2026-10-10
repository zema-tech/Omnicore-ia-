// Modulo EMAIL — IMAP (lettura) + SMTP (invio) scritti a mano su node:net/tls.
// Niente librerie: dialoghi minimi ma reali (LOGIN, SELECT, SEARCH, FETCH con
// literal; EHLO, AUTH LOGIN, DATA). Credenziali solo env (mai loggate).
// Sicurezza: STARTTLS obbligatorio su porte chiare, niente fallback plain.
// Zero dipendenze. Mai throw: sempre {ok, via, ...}.
import { connect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

export interface MailMsg { id: string; from: string; subject: string; date: string; snippet: string }
export interface MailResult<T> { ok: boolean; via: string; data?: T; error?: string }

const VIA = "email(native)";

function timeoutMs(): number {
  return Number(process.env["OMNICORE_EMAIL_TIMEOUT_MS"] ?? "15000");
}

/** Solo test/lab: salta STARTTLS su rete fidata. Default: TLS obbligatorio. */
function insecureLab(): boolean {
  return process.env["OMNICORE_EMAIL_INSECURE"] === "1";
}

/** Upgrade STARTTLS sullo stesso socket (RFC 3207). Rifiuta se fallisce. */
async function upgradeTls(sock: Socket, host: string): Promise<Socket> {
  const ms = timeoutMs();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("STARTTLS timeout")), ms);
    try {
      const tls = tlsConnect({ socket: sock, servername: host } as any, () => {
        clearTimeout(t);
        resolve(tls as unknown as Socket);
      });
      tls.once("error", (e) => {
        clearTimeout(t);
        reject(e);
      });
    } catch (e) {
      clearTimeout(t);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Socket con lettura a linee + literal {N}. Chiude sempre il socket a fine uso. */
class LineReader {
  private buf = Buffer.alloc(0);
  private queue: Buffer[] = [];
  private waiters: (() => void)[] = [];
  private closed = false;
  private sock: Socket;
  constructor(sock: Socket) {
    this.sock = sock;
    sock.on("data", (d: Buffer) => {
      this.queue.push(Buffer.from(d));
      const w = this.waiters.splice(0);
      for (const fn of w) fn();
    });
    sock.on("close", () => {
      this.closed = true;
      const w = this.waiters.splice(0);
      for (const fn of w) fn();
    });
    sock.on("error", () => {});
  }
  private async pump(): Promise<void> {
    while (this.buf.length === 0 && this.queue.length === 0 && !this.closed) {
      await new Promise<void>((res) => this.waiters.push(res));
    }
    while (this.queue.length) this.buf = Buffer.concat([this.buf, this.queue.shift()!]);
  }
  async readLine(): Promise<string | null> {
    for (;;) {
      await this.pump();
      const i = this.buf.indexOf("\r\n");
      if (i >= 0) {
        const line = this.buf.slice(0, i).toString("utf8");
        this.buf = this.buf.slice(i + 2);
        return line;
      }
      if (this.closed && this.buf.length === 0) return null;
      if (this.closed) {
        const rest = this.buf.toString("utf8");
        this.buf = Buffer.alloc(0);
        return rest || null;
      }
    }
  }
  async readBytes(n: number): Promise<Buffer> {
    while (this.buf.length < n && !this.closed) {
      await this.pump();
    }
    const out = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);
    return out;
  }
}

function openTcp(host: string, port: number, secure: boolean, ms: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("connessione timeout")), ms);
    const done = (s: Socket) => {
      clearTimeout(t);
      resolve(s);
    };
    try {
      if (secure) {
        const s = tlsConnect({ host, port, servername: host }, () => done(s));
        s.once("error", (e) => {
          clearTimeout(t);
          reject(e);
        });
      } else {
        const s = connect({ host, port }, () => done(s));
        s.once("error", (e) => {
          clearTimeout(t);
          reject(e);
        });
      }
    } catch (e) {
      clearTimeout(t);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function smtpConf(): { host: string; port: number; secure: boolean; user: string; pass: string; from: string } | null {
  const host = process.env["SMTP_HOST"] ?? "";
  if (!host) return null;
  const port = Number(process.env["SMTP_PORT"] ?? "587");
  return {
    host, port,
    secure: (process.env["SMTP_SECURE"] ?? (port === 465 ? "1" : "0")) === "1",
    user: process.env["SMTP_USER"] ?? "",
    pass: process.env["SMTP_PASS"] ?? "",
    from: process.env["SMTP_FROM"] ?? process.env["SMTP_USER"] ?? "",
  };
}

function imapConf(): { host: string; port: number; secure: boolean; user: string; pass: string } | null {
  const host = process.env["IMAP_HOST"] ?? "";
  if (!host) return null;
  const port = Number(process.env["IMAP_PORT"] ?? "993");
  return {
    host, port,
    secure: (process.env["IMAP_SECURE"] ?? (port === 993 ? "1" : "0")) === "1",
    user: process.env["IMAP_USER"] ?? "",
    pass: process.env["IMAP_PASS"] ?? "",
  };
}

async function smtpLine(r: LineReader): Promise<string> {
  let last = "";
  for (;;) {
    const l = await r.readLine();
    if (l === null) throw new Error("connessione chiusa dal server");
    last = l;
    if (/^\d{3} /.test(l)) return l;
    if (!/^\d{3}-/.test(l)) return l;
  }
}

function smtpCode(l: string): number {
  return Number(l.slice(0, 3));
}

/** Invia email via SMTP (STARTTLS su porte chiare, AUTH LOGIN). */
export async function mailSend(to: string, subject: string, text: string): Promise<MailResult<{ accepted: boolean }>> {
  const c = smtpConf();
  if (!c) return { ok: false, via: VIA, error: "SMTP_HOST non impostato (configura SMTP_HOST/PORT/USER/PASS)" };
  if (!c.user || !c.pass) return { ok: false, via: VIA, error: "SMTP_USER/SMTP_PASS mancanti" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, via: VIA, error: `destinatario invalido: ${to}` };
  if (!text.trim()) return { ok: false, via: VIA, error: "testo vuoto" };
  let sock: Socket | null = null;
  try {
    sock = await openTcp(c.host, c.port, c.secure, timeoutMs());
    sock.setTimeout(timeoutMs());
    let r = new LineReader(sock);
    const greet = await smtpLine(r);
    if (smtpCode(greet) !== 220) throw new Error(`saluto: ${greet.slice(0, 80)}`);
    const write = (s: string) => new Promise<void>((res, rej) => sock!.write(s + "\r\n", (e) => (e ? rej(e) : res())));
    await write(`EHLO omnicore`);
    let line = await smtpLine(r);
    if (smtpCode(line) !== 250) throw new Error(`EHLO: ${line.slice(0, 80)}`);
    if (!c.secure) {
      await write("STARTTLS");
      line = await smtpLine(r);
      if (smtpCode(line) !== 220) throw new Error(`STARTTLS rifiutato (niente fallback plain): ${line.slice(0, 80)}`);
      if (!insecureLab()) {
        sock = await upgradeTls(sock, c.host);
        sock.setTimeout(timeoutMs());
        r = new LineReader(sock);
        await write(`EHLO omnicore`);
        line = await smtpLine(r);
        if (smtpCode(line) !== 250) throw new Error(`EHLO tls: ${line.slice(0, 80)}`);
      }
    }
    await write(`AUTH LOGIN`);
    line = await smtpLine(r);
    if (smtpCode(line) !== 334) throw new Error(`AUTH non offerta: ${line.slice(0, 80)}`);
    await write(Buffer.from(c.user, "utf8").toString("base64"));
    line = await smtpLine(r);
    if (smtpCode(line) !== 334) throw new Error("username rifiutato");
    await write(Buffer.from(c.pass, "utf8").toString("base64"));
    line = await smtpLine(r);
    if (smtpCode(line) !== 235) throw new Error("credenziali rifiutate");
    await write(`MAIL FROM:<${c.from}>`);
    line = await smtpLine(r);
    if (smtpCode(line) !== 250) throw new Error(`mittente: ${line.slice(0, 80)}`);
    await write(`RCPT TO:<${to}>`);
    line = await smtpLine(r);
    if (smtpCode(line) !== 250 && smtpCode(line) !== 251) throw new Error(`destinatario: ${line.slice(0, 80)}`);
    await write("DATA");
    line = await smtpLine(r);
    if (smtpCode(line) !== 354) throw new Error(`DATA: ${line.slice(0, 80)}`);
    const safe = text.replace(/\r?\n\./g, "\n..");
    await write(`From: ${c.from}\r\nTo: ${to}\r\nSubject: ${subject.slice(0, 200)}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${safe}\r\n.`);
    line = await smtpLine(r);
    if (smtpCode(line) !== 250) throw new Error(`invio: ${line.slice(0, 80)}`);
    try {
      await write("QUIT");
    } catch { /* chiusura best-effort */ }
    return { ok: true, via: `${VIA}(smtp)`, data: { accepted: true } };
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  } finally {
    try {
      sock?.destroy();
    } catch { /* già chiuso */ }
  }
}

async function imapTagged(r: LineReader, tag: string): Promise<string[]> {
  const lines: string[] = [];
  for (;;) {
    const l = await r.readLine();
    if (l === null) throw new Error("connessione chiusa dal server");
    // literal {N}: leggi N byte e continua (riga logica unica)
    const lit = l.match(/\{(\d+)\}\r?$/);
    if (lit) {
      const n = Number(lit[1]);
      if (n > 100_000) throw new Error("literal troppo grande");
      const body = (await r.readBytes(n)).toString("utf8");
      lines.push(l + "\n" + body);
      // CRLF dopo il literal
      await r.readLine().catch(() => null);
      continue;
    }
    if (l.startsWith(`${tag} `)) {
      lines.push(l);
      const code = l.slice(tag.length + 1, tag.length + 3);
      if (code !== "OK") throw new Error(`${tag}: ${l.slice(0, 120)}`);
      return lines;
    }
    lines.push(l);
  }
}

function parseAddr(v: string): string {
  const m = v.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  return m ? m[1] : v.replace(/["<>]/g, "").trim().slice(0, 120);
}

/** Legge le ultime email (default non lette). Mai segna come lette (PEEK). */
export async function mailRead(opts: { limit?: number; unseen?: boolean; mailbox?: string } = {}): Promise<MailResult<{ messages: MailMsg[] }>> {
  const c = imapConf();
  if (!c) return { ok: false, via: VIA, error: "IMAP_HOST non impostato (configura IMAP_HOST/USER/PASS)" };
  if (!c.user || !c.pass) return { ok: false, via: VIA, error: "IMAP_USER/IMAP_PASS mancanti" };
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 30));
  let sock: Socket | null = null;
  try {
    sock = await openTcp(c.host, c.port, c.secure, timeoutMs());
    sock.setTimeout(timeoutMs());
    let r = new LineReader(sock);
    const greet = await r.readLine();
    if (greet === null || !greet.startsWith("* OK")) throw new Error(`saluto: ${(greet ?? "").slice(0, 80)}`);
    const write = (s: string) => new Promise<void>((res, rej) => sock!.write(s + "\r\n", (e) => (e ? rej(e) : res())));
    let tag = 0;
    const cmd = async (s: string): Promise<string[]> => {
      tag++;
      await write(`a${tag} ${s}`);
      return imapTagged(r, `a${tag}`);
    };
    if (!c.secure) {
      // STARTTLS prima del login su porte chiare
      const caps = await cmd("CAPABILITY");
      if (!caps.join(" ").includes("STARTTLS")) throw new Error("niente STARTTLS (no fallback plain)");
      if (!insecureLab()) {
        sock = await upgradeTls(sock, c.host);
        sock.setTimeout(timeoutMs());
        r = new LineReader(sock);
      }
    }
    await cmd(`LOGIN "${c.user.replace(/"/g, "")}" "${c.pass.replace(/"/g, "")}"`);
    await cmd(`SELECT "${(opts.mailbox ?? "INBOX").replace(/"/g, "")}"`);
    const search = await cmd(opts.unseen === false ? "SEARCH ALL" : "SEARCH UNSEEN");
    const ids = search.join(" ").match(/SEARCH([\d\s]*)/)?.[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
    const take = ids.slice(-limit).reverse();
    const messages: MailMsg[] = [];
    for (const id of take) {
      const lines = await cmd(`FETCH ${id} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)] BODY.PEEK[TEXT]<0.600>)`);
      const blob = lines.join("\n");
      const from = blob.match(/^From:\s*(.+)$/im)?.[1] ?? "?";
      const subject = blob.match(/^Subject:\s*(.+)$/im)?.[1] ?? "(senza oggetto)";
      const date = blob.match(/^Date:\s*(.+)$/im)?.[1] ?? "";
      const bodyParts = blob.split(/\r?\n\r?\n/).slice(1).join("\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      messages.push({ id, from: parseAddr(from.trim()), subject: subject.trim().slice(0, 160), date: date.trim().slice(0, 40), snippet: bodyParts.slice(0, 300) });
    }
    try {
      await cmd("LOGOUT");
    } catch { /* chiusura best-effort */ }
    return { ok: true, via: `${VIA}(imap)`, data: { messages } };
  } catch (e) {
    return { ok: false, via: VIA, error: String(e).slice(0, 200) };
  } finally {
    try {
      sock?.destroy();
    } catch { /* già chiuso */ }
  }
}

export const email = { send: mailSend, read: mailRead };
