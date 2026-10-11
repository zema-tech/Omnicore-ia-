# hello-world (plugin di esempio)

Il plugin più piccolo possibile:

- `plugin.json` — manifesto (nome, versione, entry)
- `index.js` — esporta `setup(ctx)`, registra tool `saluta` + hook `turn_end`

Prova:

```bash
export OMNICORE_PLUGINS_DIR=/tmp/pi-plugins
node omnicore/src/index.ts --plugins install examples/plugins/hello-world
node omnicore/src/index.ts --agent "confermo: carica plugin hello-world e chiama saluta"
```
