// Omnicore entry.
//   --agent  "…"   → turno IA (tool unificati, identità Omnicore)
//   --fuse   "…"   → pipeline legacy brain→hands→face
//   (default) "…"  → route singola (debug)
import { route } from "./router.ts";
import { fuse } from "./pipeline.ts";
import { loadConfig } from "./config.ts";
import { hermes } from "./adapters/hermes.ts";
import { opencode } from "./adapters/opencode.ts";
import { openclaw } from "./adapters/openclaw.ts";
import { runAgent } from "./agent/index.ts";

async function main() {
  const raw = process.argv.slice(2);
  const doFuse = raw.includes("--fuse");
  const doAgent = raw.includes("--agent");
  const dirIdx = raw.indexOf("--dir");
  const directory = dirIdx >= 0 ? raw[dirIdx + 1] : undefined;
  const text =
    raw
      .filter(
        (a) =>
          a !== "--fuse" &&
          a !== "--agent" &&
          a !== "--dir" &&
          (dirIdx < 0 || a !== raw[dirIdx + 1]),
      )
      .join(" ") || "ciao";
  const cfg = loadConfig();

  if (doAgent) {
    console.log(JSON.stringify(await runAgent(text, { directory }), null, 2));
    return;
  }

  if (doFuse) {
    console.log(JSON.stringify(await fuse({ text, directory }), null, 2));
    return;
  }

  const { intent, handler } = route({ text });
  console.log(JSON.stringify({ intent, handler, text }));

  if (handler === "hermes") {
    try {
      const res = await hermes.recall(text, 10, {
        python: cfg.hermesPython,
        hermesDir: cfg.hermesDir,
      });
      console.log(JSON.stringify({ via: "hermes", res }));
    } catch (e) {
      console.log(JSON.stringify({ via: "hermes", error: String(e).slice(0, 300) }));
    }
    return;
  }
  if (handler === "opencode") {
    try {
      const res = await opencode.promptServer(
        text,
        { baseUrl: cfg.opencodeUrl, password: cfg.opencodePassword || undefined },
        { directory },
      );
      console.log(JSON.stringify({ via: "opencode", res }));
    } catch {
      try {
        const cli = await opencode.promptCli(text, {}, { directory });
        console.log(JSON.stringify({ via: "opencode-cli", res: cli.slice(0, 2000) }));
      } catch {
        console.log(
          JSON.stringify({
            via: "opencode",
            hint: `avvia 'opencode serve' (OPENCODE_URL=${cfg.opencodeUrl}) oppure installa la CLI 'opencode run'.`,
          }),
        );
      }
    }
    return;
  }
  try {
    const res = await openclaw.status({
      baseUrl: cfg.openclawUrl,
      token: cfg.openclawToken || undefined,
    });
    console.log(JSON.stringify({ via: "openclaw", res }));
  } catch {
    console.log(
      JSON.stringify({
        via: "openclaw",
        hint: `gateway non raggiungibile. OPENCLAW_URL=${cfg.openclawUrl}`,
      }),
    );
  }
}

await main();
