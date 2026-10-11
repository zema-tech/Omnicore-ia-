// Plugin community: statistiche vault (legge OMNICORE_VAULT_DIR o default).
const fs = require("node:fs");
const path = require("node:path");

async function setup(ctx) {
  ctx.registerTool({
    name: "statistiche",
    description: "Conta file, parole e link [[ ]] del vault",
    run: async () => {
      const dir = process.env["OMNICORE_VAULT_DIR"] || "omnicore/data/vault";
      let files = [];
      try {
        files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
      } catch {
        return { files: 0, note: "vault illeggibile" };
      }
      let words = 0;
      let links = 0;
      for (const f of files) {
        try {
          const t = fs.readFileSync(path.join(dir, f), "utf8");
          words += t.split(/\s+/).filter(Boolean).length;
          links += (t.match(/\[\[.+\]\]/g) || []).length;
        } catch { /* singolo file rotto: salta */ }
      }
      return { files: files.length, parole: words, link: links };
    },
  });
}

module.exports = { setup };
