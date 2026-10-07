# Omnicore — architettura IA (non orchestratore)

Omnicore è un'**IA agente** nata dalle capacità di più motori open-source.
L'utente parla solo con Omnicore. I vendor non compaiono come prodotti in facciata.

## Organi interni

| Organo Omnicore | Motore (vendor) | Funzione |
|-----------------|-----------------|----------|
| **memory.*** | NATIVO (`modules/sessions.ts` + `mind/memory.ts` + `vault/`) — Hermes solo canali esterni | sessioni, recall, note |
| **skills** | NATIVO (`modules/skills.ts`, dir `skills/` versionata) | capacità caricabili |
| **permissions** | NATIVO (`modules/permissions.ts`, approvals in `data/approvals.json`) | approval flow |
| **code.*** | NATIVO (`faculties/native_fs.ts` + `modules/edit|search|todo.ts`) — OpenCode solo boost opzionale | file, shell, edit+diff, grep/glob, coding |
| **channel.*** | OpenClaw | presenza, canali, ops |
| **world.*** | Mirage (da collegare) | VFS / terminal virtuale |
| **decide.*** | CLM (da collegare) | System One: rank/verify azioni |
| **respond** | nucleo | risposta all'utente |

## Facoltà codice nativa

`code.run` è il path felice: prompt con lettura/scrittura/shell riconoscibili
vanno al nativo (`code(native-read|write|shell)`, jail su `OMNICORE_WORKSPACE`
o cwd, blocklist comandi, timeout 30s). Solo i task generici usano OpenCode
(`code(opencode-serve|cli)`) come boost opzionale. Tool precisi: `code.read`,
`code.write`, `code.shell` (scritture con conferma, Tappa 6).

## Nucleo (`src/agent/`)

- `identity.ts` — chi è Omnicore (system prompt)
- `tools.ts` — tool surface unificata + dispatch alle facoltà
- `loop.ts` — turno agente: plan → facoltà → sintesi (mente)

## Facoltà (`src/faculties/`, mirror `omnicore_py/faculties/`)

Ogni facoltà è una capacità **fusa** con funzioni pulite. Dentro fonde vendor
+ nativo; fuori nessuno sa che esistono Hermes/OpenCode/OpenClaw:

- `memory.ts` — `search()` fonde memoria nativa + Hermes + sessioni;
  `read()` lettura profonda; `remember()` fatti espliciti
- `code.ts` — `run()` con fallback serve→CLI normalizzato in `{ok, via, output}`
- `channel.ts` — `status()` gateway; `announce()` best-effort (mai throw)

Gli `adapters/` restano il confine grezzo coi vendor (mai chiamati
direttamente da pipeline o loop). Se un motore viene sostituito, cambia solo
la facoltà corrispondente.

Il `plan()` attuale è deterministico (router leggero). Sostituibile con:

1. LLM tool-calling (qualsiasi provider)
2. CLM `decide.rank` su candidati tool
3. ibrido: CLM filtra, LLM scrive

## Cosa non siamo

- Non un dashboard che "apre tre app"
- Non un `if product == hermes`
- Non una fusione di monorepo giganti in un solo linguaggio

Siamo un **agente** con organi intercambiabili.

## Prossimi collegamenti

```bash
# submodule consigliati
git submodule add --depth 1 https://github.com/Contrastive-LM/CLM.git vendors/clm
git submodule add --depth 1 https://github.com/strukto-ai/mirage.git vendors/mirage
```

Poi implementare:

- `adapters/clm.ts` → `decide.rank` / `decide.verify`
- `adapters/mirage.ts` → `world.exec`
