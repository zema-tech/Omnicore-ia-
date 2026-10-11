// Plugin di esempio Omnicore — copia questo per i tuoi.
// Contratto: esporta setup(ctx). ctx: {name, config, log,
// registerTool({name, description, run}), registerHook(event, fn),
// llm.complete(system, user)}.
let calls = 0;

async function setup(ctx) {
  ctx.registerTool({
    name: "saluta",
    description: "Saluta qualcuno e conta le chiamate",
    run: async (args) => {
      calls++;
      return `ciao ${args.nome || "mondo"} (chiamata #${calls})`;
    },
  });
  ctx.registerHook("turn_end", async (data) => {
    ctx.log(`turno finito: ${data.rounds || 1} giri`);
  });
}

module.exports = { setup };
