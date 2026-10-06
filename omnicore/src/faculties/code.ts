// Facoltà CODICE — le mani di Omnicore: PRIMA native, OpenCode solo fallback.
//
// run(prompt): se il prompt chiede lettura/scrittura/shell su path riconoscibili
// usa il nativo (zero rete, zero vendor); altrimenti opencode serve → CLI.
// Sempre {ok, via, output}. via: code(native-read|write|shell),
// code(opencode-serve|cli). Mai throw.
import { opencode } from "../adapters/opencode.ts";
import { loadConfig } from "../config.ts";
import { readFile, writeFile, runShell, listDir } from "./native_fs.ts";

export interface CodeResult {
  ok: boolean;
  via: string;
  output: string;
}

const QUOTED = /[`'"“”]([^`'"“”]+)[`'"“”]/;

function looksLikePath(s: string): boolean {
  return /[/\\]/.test(s) || /\.[a-z0-9]{1,5}$/i.test(s);
}

type LocalTask =
  | { kind: "read"; path: string }
  | { kind: "list"; path: string }
  | { kind: "write"; path: string; content: string; contentDefault: boolean }
  | { kind: "shell"; cmd: string };

/** Euristica: prompt in linguaggio naturale -> task nativo, o null (= serve OpenCode). */
export function parseLocalTask(prompt: string): LocalTask | null {
  const t = prompt.trim();

  // shell esplicita tra apici: esegui "ls -la /tmp"
  const shellM = t.match(/(esegui|lancia|avvia|run|esegui il comando)\s+[`'"“]/i);
  if (shellM) {
    const q = t.match(QUOTED);
    if (q?.[1].trim()) return { kind: "shell", cmd: q[1].trim() };
  }

  // lettura: leggi / mostra / apri <path>
  const readM = t.match(/(leggi|read|mostra(?:mi)?|apri|vedi|cat)\s+(?:il\s+file\s+|file\s+|il\s+)?[`'"“]?([^\s`'"“”]+)[`'"“]?/i);
  if (readM && looksLikePath(readM[2])) {
    if (/^(la|le|il|lo|i|gli|che|come|se|questo|questa)\b/i.test(readM[2])) return null;
    return { kind: "read", path: readM[2] };
  }

  // elenco: elenca / lista [dir]
  if (/(elenca|lista|list|ls)\b/i.test(t)) {
    const p = t.match(QUOTED)?.[1] ?? t.match(/(elenca|lista|list|ls)\s+(?:i\s+file\s+(?:di|in)\s+|di\s+|in\s+)?([^\s]+)/i)?.[2];
    if (!p || /^(i|file|files)$/i.test(p)) return { kind: "list", path: "." };
    if (looksLikePath(p)) return { kind: "list", path: p };
    return { kind: "list", path: "." };
  }

  // scrittura: scrivi / crea [file] <nome> [in <dir>] [con contenuto ...]
  const writeM = t.match(/(scrivi|crea|genera)\s+(?:un\s+file\s+|il\s+file\s+|file\s+|una\s+nota\s+)?[`'"“]?([^\s`'"“”]+)[`'"“]?/i);
  if (writeM && !/^(che|come|se|una|delle|degli|questo)\b/i.test(writeM[2])) {
    let name = writeM[2];
    const dirM = t.match(/(?:\bin|\ba|\bdentro|\bin\s+directory)\s+[`'"“]?([^\s`'"“”]+)[`'"“]?/i);
    let path = name;
    if (dirM && looksLikePath(dirM[1]) && !looksLikePath(name)) {
      const base = name.replace(/\/+$/, "");
      path = dirM[1].replace(/\/+$/, "") + "/" + base + (/\./.test(base) ? "" : ".txt");
    } else if (!looksLikePath(name)) {
      return null; // "scrivi una mail" non è un file: tocca a OpenCode/LLM
    }
    const contentM = t.match(/(?:contenuto|testo)\s*:?\s*[`'"“]?([\s\S]+?)[`'"“]?\s*$/i)
      ?? t.match(/:\s*[`'"“]([^`'"“]+)[`'"“]\s*$/);
    const raw = contentM?.[1]?.trim() ?? "";
    const meaningful = raw && !/^(in|a|dentro)\s+[^\s]+$/i.test(raw);
    const fileName = path.split("/").pop() ?? "file";
    const stem = fileName.replace(/\.[^.]+$/, "");
    return {
      kind: "write",
      path,
      content: meaningful ? raw : `${stem}\n`,
      contentDefault: !meaningful,
    };
  }

  return null;
}

/** Esegue un task di coding: nativo se riconoscibile, else OpenCode. Mai throw. */
export async function run(prompt: string, opts: { directory?: string } = {}): Promise<CodeResult> {
  const local = parseLocalTask(prompt);
  if (local) {
    if (local.kind === "read") return readFile(local.path);
    if (local.kind === "list") return listDir(local.path);
    if (local.kind === "shell") return runShell(local.cmd, { cwd: opts.directory });
    const r = writeFile(local.path, local.content);
    if (r.ok && local.contentDefault) {
      return { ...r, output: r.output + " (contenuto di default: specifica «con contenuto …» per il tuo testo)" };
    }
    return r;
  }

  const cfg = loadConfig();
  try {
    const data = await opencode.promptServer(
      prompt,
      { baseUrl: cfg.opencodeUrl, password: cfg.opencodePassword || undefined },
      { directory: opts.directory },
    );
    const output = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return { ok: true, via: "code(opencode-serve)", output: output.slice(0, 4000) };
  } catch {
    try {
      const cli = await opencode.promptCli(prompt, {}, {
        directory: opts.directory,
        timeoutMs: Number(process.env["OPENCODE_CLI_TIMEOUT_MS"] ?? "60000"),
      });
      if (/"type"\s*:\s*"error"/.test(cli.slice(0, 500))) {
        return { ok: false, via: "code(opencode-cli)", output: "il motore coding ha risposto con un errore interno (serve configurazione modello/API). Avvia 'opencode serve' configurato o sistema la CLI, poi riprova." };
      }
      return { ok: true, via: "code(opencode-cli)", output: cli.slice(0, 4000) };
    } catch {
      return {
        ok: false,
        via: "code(opencode)",
        output: "motore coding non disponibile ora (serve e CLI non raggiungibili o oltre budget tempo).",
      };
    }
  }
}

export const code = { run, parseLocalTask };
