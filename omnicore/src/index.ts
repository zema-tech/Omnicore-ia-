// Omnicore entry.
//   --agent  "…"   → turno IA (tool unificati, identità Omnicore)
//   --stream "…"   → turno IA con eventi NDJSON (token/tool/loop_end) su stdout
//   --fuse   "…"   → pipeline legacy brain→hands→face
//   --doctor       → verifica quale cervello risponde (api/local/euristica)
//   --plugins <cmd> [arg] → gestione plugin (list, info, install, remove)
//   (default) "…"  → route singola (debug)
import { route } from "./router.ts";
import { fuse } from "./pipeline.ts";
import { llmDoctor } from "./mind/llm.ts";
import { plugins } from "./modules/plugins.ts";
import { memory } from "./faculties/memory.ts";
import { code } from "./faculties/code.ts";
import { channel } from "./faculties/channel.ts";
import { runAgent } from "./agent/index.ts";

async function main() {
  const raw = process.argv.slice(2);
  const doFuse = raw.includes("--fuse");
  const doAgent = raw.includes("--agent");
  const doStream = raw.includes("--stream");
  const doDoctor = raw.includes("--doctor");
  const dirIdx = raw.indexOf("--dir");
  const directory = dirIdx >= 0 ? raw[dirIdx + 1] : undefined;
  const text =
    raw
      .filter(
        (a) =>
          a !== "--fuse" &&
          a !== "--agent" &&
          a !== "--stream" &&
          a !== "--dir" &&
          (dirIdx < 0 || a !== raw[dirIdx + 1]),
      )
      .join(" ") || "ciao";

  if (doDoctor) {
    console.log(JSON.stringify(await llmDoctor(), null, 2));
    return;
  }

  const plugIdx = raw.indexOf("--plugins");
  if (plugIdx >= 0) {
    const cmd = raw[plugIdx + 1] ?? "list";
    const arg = raw[plugIdx + 2];
    try {
      if (cmd === "list") {
        console.log(JSON.stringify(plugins.list().map((p) => ({ ...p.manifest, loaded: p.loaded })), null, 2));
      } else if (cmd === "info" && arg) {
        const p = plugins.list().find((x) => x.manifest.name === arg.toLowerCase());
        if (!p) throw new Error(`plugin non installato: ${arg}`);
        console.log(JSON.stringify(p.manifest, null, 2));
      } else if (cmd === "install" && arg) {
        const byName = !arg.includes("/") && !arg.includes("\\");
        console.log(JSON.stringify(byName ? await plugins.installByName(arg) : await plugins.install(arg), null, 2));
      } else if (cmd === "search") {
        console.log(JSON.stringify(plugins.search(arg ?? ""), null, 2));
      } else if (cmd === "remove" && arg) {
        console.log(JSON.stringify(plugins.remove(arg), null, 2));
      } else {
        console.log(JSON.stringify({ error: "uso: --plugins <list|info|install|remove|search> [nome|path|url]", dir: plugins.dir() }));
      }
    } catch (e) {
      console.log(JSON.stringify({ error: String(e).slice(0, 250) }));
    }
    return;
  }

  if (doAgent || doStream) {
    if (!doStream) {
      console.log(JSON.stringify(await runAgent(text, { directory }), null, 2));
      return;
    }
    const say = (o: unknown) => console.log(JSON.stringify(o));
    const res = await runAgent(text, {
      directory,
      onEvent: (e) => say(e.event === "token" ? { event: "token", text: e.text } : e),
    });
    say({ event: "result", reply: res.reply, rounds: res.rounds, planner: res.planner, intent: res.intent });
    return;
  }

  if (doFuse) {
    console.log(JSON.stringify(await fuse({ text, directory }), null, 2));
    return;
  }

  const { intent, handler } = route({ text });
  console.log(JSON.stringify({ intent, handler, text }));

  // Debug a singola facoltà: passa dalle FACOLTÀ fuse, mai dagli adapter vendor.
  if (handler === "memory") {
    try {
      const res = await memory.search(text, 10);
      console.log(JSON.stringify({ via: res.via, res: res.hits }));
    } catch (e) {
      console.log(JSON.stringify({ via: "memory", error: String(e).slice(0, 300) }));
    }
    return;
  }
  if (handler === "code") {
    const res = await code.run(text, { directory });
    console.log(JSON.stringify({ via: res.via, res: res.output.slice(0, 2000) }));
    return;
  }
  try {
    const res = await channel.status();
    console.log(JSON.stringify({ via: "channel(native status)", res }));
  } catch {
    console.log(
      JSON.stringify({
        via: "channel(native)",
        hint: `gateway non raggiungibile.`,
      }),
    );
  }
}

await main();
