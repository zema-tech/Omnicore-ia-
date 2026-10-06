// Facoltà CODICE — le mani fuse di Omnicore.
//
// UN solo ingresso run(): dentro prova `opencode serve` HTTP e ripiega sulla
// CLI `opencode run`, normalizzando l'output in {ok, via, output}.
// Chi chiama non sa (e non deve sapere) quale backend ha risposto.
import { opencode } from "../adapters/opencode.ts";
import { loadConfig } from "../config.ts";

export interface CodeResult {
  ok: boolean;
  via: string;
  output: string;
}

/** Esegue un task di coding. Mai throw: gli errori stanno in {ok:false}.
 * Budget CLI dal path agente: OPENCODE_CLI_TIMEOUT_MS (default 60s, interattivo).
 * Il default diretto della CLI resta 120s per usi batch. */
export async function run(prompt: string, opts: { directory?: string } = {}): Promise<CodeResult> {
  const cfg = loadConfig();
  try {
    const data = await opencode.promptServer(
      prompt,
      { baseUrl: cfg.opencodeUrl, password: cfg.opencodePassword || undefined },
      { directory: opts.directory },
    );
    const output = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return { ok: true, via: "code(opencode-serve)", output: output.slice(0, 4000) };
  } catch (e1) {
    try {
      const cli = await opencode.promptCli(prompt, {}, {
        directory: opts.directory,
        timeoutMs: Number(process.env["OPENCODE_CLI_TIMEOUT_MS"] ?? "60000"),
      });
      if (/"type"\s*:\s*"error"/.test(cli.slice(0, 500))) {
        return { ok: false, via: "code(opencode-cli)", output: "il motore coding ha risposto con un errore interno (serve configurazione modello/API). Avvia 'opencode serve' configurato o sistema la CLI, poi riprova." };
      }
      return { ok: true, via: "code(opencode-cli)", output: cli.slice(0, 4000) };
    } catch (e2) {
      return {
        ok: false,
        via: "code(opencode)",
        output: "motore coding non disponibile ora (serve e CLI non raggiungibili o oltre budget tempo).",
      };
    }
  }
}

export const code = { run };
