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

/** Esegue un task di coding. Mai throw: gli errori stanno in {ok:false}. */
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
      const cli = await opencode.promptCli(prompt, {}, { directory: opts.directory });
      return { ok: true, via: "code(opencode-cli)", output: cli.slice(0, 4000) };
    } catch (e2) {
      return {
        ok: false,
        via: "code(opencode)",
        output: `mani non raggiungibili: ${String(e1).slice(0, 200)} | cli: ${String(e2).slice(0, 200)}. Avvia 'opencode serve' o installa la CLI, poi riprova.`,
      };
    }
  }
}

export const code = { run };
