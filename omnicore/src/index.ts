// Omnicore entry — minimal runnable demo: classifies input and
// dispatches to Hermes (brain) / OpenCode (hands) / OpenClaw (face).
// Run: node --experimental-strip-types src/index.ts "fix login bug"
import { route } from "./router.ts";
import { hermes } from "./adapters/hermes.ts";
import { opencode } from "./adapters/opencode.ts";
import { openclaw } from "./adapters/openclaw.ts";

const OPENCODE_URL = process.env["OPENCODE_URL"] ?? "http://127.0.0.1:4096";
const OPENCLAW_URL = process.env["OPENCLAW_URL"] ?? "http://127.0.0.1:18789";

async function main() {
  const text = process.argv.slice(2).join(" ") || "ciao";
  const { intent, handler } = route({ text });
  console.log(JSON.stringify({ intent, handler, text }));

  if (handler === "hermes") {
    // brain first: recall past context (fails soft if hermes not installed)
    try {
      const res = await hermes.recall(text);
      console.log(JSON.stringify({ via: "hermes", res }));
    } catch (e) {
      console.log(JSON.stringify({ via: "hermes", error: String(e).slice(0, 300) }));
    }
    return;
  }
  if (handler === "opencode") {
    try {
      const res = await opencode.promptServer(text, { baseUrl: OPENCODE_URL });
      console.log(JSON.stringify({ via: "opencode", res }));
    } catch {
      console.log(
        JSON.stringify({
          via: "opencode",
          hint: `avvia 'opencode serve' oppure usa promptCli fallback. OPENCODE_URL=${OPENCODE_URL}`,
        }),
      );
    }
    return;
  }
  // ops -> openclaw gateway
  try {
    const res = await openclaw.announce({ baseUrl: OPENCLAW_URL }, text);
    console.log(JSON.stringify({ via: "openclaw", res }));
  } catch {
    console.log(
      JSON.stringify({
        via: "openclaw",
        hint: `gateway non raggiungibile. OPENCLAW_URL=${OPENCLAW_URL}`,
      }),
    );
  }
}

await main();
