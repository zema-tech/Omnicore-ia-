# Plugin Omnicore

Estensioni in codice (diverse dalle skill, che sono Markdown). Un plugin
registra **tool** richiamabili dal loop e **hook** sugli eventi.

## Anatomia

```
mio-plugin/
  plugin.json   manifesto: name, version (semver), author, description, entry
  index.js      esporta setup(ctx)  (CJS o ESM, import dinamico)
```

`setup(ctx)` riceve il contesto SDK:

- `ctx.registerTool({name, description, run})` — `run(args)` ritorna qualsiasi JSON
- `ctx.registerHook("turn_end", fn)` — `fn({text, intent, rounds, planner, reply})`
- `ctx.llm.complete(system, user)` — LLM dell'host, **senza esporre chiavi**
- `ctx.config`, `ctx.log(msg)` (su stderr, mai fatale)

Esempio completo: `examples/plugins/hello-world/`.

## CLI

```bash
export OMNICORE_PLUGINS_DIR=~/.omnicore/plugins   # default
node omnicore/src/index.ts --plugins list
node omnicore/src/index.ts --plugins search vault
node omnicore/src/index.ts --plugins install hello-world   # dal catalogo
node omnicore/src/index.ts --plugins install ./mio-plugin  # path locale
node omnicore/src/index.ts --plugins install https://…git  # git clone
node omnicore/src/index.ts --plugins remove hello-world
```

Nel loop: `plugin.load {name}` e `plugin.call {plugin, tool, args}` vogliono
conferma (codice di terzi); `plugin.search/info/list` liberi.

## Catalogo

`omnicore/plugins-catalog.json`: voci `{name, description, tier, version,
source}`. Tier `official` (mantenuti qui) e `community` (esterni, verifica tu).
Per pubblicare: apri PR che aggiunge la voce con source git pinnato a tag.

## Fiducia (leggere)

I plugin girano come codice locale con gli stessi builtin di Node: **niente
sandbox VM**. Installa solo fonti fidate, leggi `index.js` prima di `load`,
revoca con `remove` (cancella anche i file). Le permission del manifesto sono
dichiarative (documentano, non isolano).
