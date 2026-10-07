# Omnicore-ia — un unico agente IA

**Omnicore** è un agente IA che gira in un solo loop (`piano → strumenti → risposta`)
con identità, memoria e mani proprie. Nasce studiando tre progetti open-source —
[Hermes Agent](vendors/hermes), [OpenCode](vendors/opencode), [OpenClaw](vendors/openclaw) —
e **fonde le loro funzioni in moduli nativi**, invece di chiamarli come prodotti esterni.
L'utente parla solo con **Omnicore**: i vendor non compaiono in facciata.

## Un turno di Omnicore

```
tu scrivi → piano (LLM tool-calling, fallback offline) → decide verifica →
strumenti nativi → approvazione umana se rischioso → UNA risposta
```

## Quickstart

```bash
git clone --recurse-submodules https://github.com/zema-tech/Omnicore-ia-.git
cd Omnicore-ia-/omnicore
cp .env.example .env   # opzionale: token, chiavi LLM, profili

npm run agent -- "cerca TODO nei file"        # mani native, subito
npm run agent -- "ti ricordi come mi chiamo?" # memoria nativa
npm run agent -- "confermo: scrivi un file hello con contenuto ciao"

npm test        # 90+ test, zero dipendenze (solo node:test)
npm run typecheck

npm run serve   # API + dashboard su http://127.0.0.1:8100
```

## Moduli nativi (`omnicore/src/modules/` + `faculties/`)

| Modulo | Funzione | Da cosa nasce |
|---|---|---|
| `memory` + `vault/` + `sessions` | recall fuso, note `[[link]]`, conversazioni | Hermes sessions/recall |
| `code` + `native_fs` + `edit` + `search` + `todo` | leggi/scrivi/shell, diff preview, glob/grep, piano di lavoro | OpenCode read/write/edit/tools |
| `channels` | console + webhook, annunci con conferma | OpenClaw channels |
| `cron` | job once/delay/every persistiti | OpenClaw cron + Hermes cron |
| `agents` | registro agenti | OpenClaw agents |
| `permissions` | approval flow (`approvo <id>` / `nego <id>`) | Hermes permissions + edit-approval |
| `skills` | capacità caricabili da `omnicore/skills/` | Hermes skills + OpenCode skill |
| `decide` | cascata regole → Jev API → CLM GPU | CLM System One + jev-harness |
| `mind` | sintesi a risposta unica (LLM o euristica) | nucleo |

Sicurezza: Bearer obbligatorio sul server (fail-closed), conferma esplicita e
approvazioni con id per ogni scrittura/esecuzione. Profili `light/medium/alt` via config.

## Struttura

```
omnicore/
  src/agent/      loop, piano (LLM+keyword), 40+ tool
  src/modules/    canali, cron, agenti, sessioni, permessi, skill, edit, search, todo
  src/faculties/  memoria, codice, presenza (vendor solo come fallback)
  src/decide/     regole locali → Jev → CLM
  src/mind/       LLM (api/locale) + sintesi
  src/vault/      note Markdown [[link]]
  skills/         skill versionate con git
  data/vault/     note cervello (versionate) — resto di data/ ignorato
  tests/          suite node:test
  server.py       guscio HTTP del loop + dashboard
  omniling/       DSL .omni opzionale
vendors/          submodule di riferimento (mai editati a mano)
```

Dettaglio architettura: [`omnicore/ARCHITECTURE.md`](omnicore/ARCHITECTURE.md) ·
Deploy su qualsiasi host: [`omnicore/DEPLOY.md`](omnicore/DEPLOY.md).
