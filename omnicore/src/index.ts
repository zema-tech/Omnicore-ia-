// Omnicore entry.
//   --agent  "…"   → turno IA (tool unificati, identità Omnicore)
//   --stream "…"   → turno IA con eventi NDJSON (token/tool/loop_end) su stdout
//   --fuse   "…"   → pipeline legacy brain→hands→face
//   --doctor       → verifica quale cervello risponde (api/local/euristica)
//   (default) "…"  → route singola (debug)
import { route } from "./router.ts";
import { fuse } from "./pipeline.ts";
import { llmDoctor } from "./mind/llm.ts";
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
