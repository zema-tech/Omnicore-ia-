# Omnicore — architettura IA (non orchestratore)

Omnicore è un'**IA agente** nata dalle capacità di più motori open-source.
L'utente parla solo con Omnicore. I vendor non compaiono come prodotti in facciata.

## Organi interni

| Organo Omnicore | Motore (vendor) | Funzione |
|-----------------|-----------------|----------|
| **memory.*** | Hermes Agent | memoria, skill, recall |
| **code.*** | OpenCode | coding agency |
| **channel.*** | OpenClaw | presenza, canali, ops |
| **world.*** | Mirage (da collegare) | VFS / terminal virtuale |
| **decide.*** | CLM (da collegare) | System One: rank/verify azioni |
| **respond** | nucleo | risposta all'utente |

## Nucleo (`src/agent/`)

- `identity.ts` — chi è Omnicore (system prompt)
- `tools.ts` — tool surface unificata + dispatch agli organi
- `loop.ts` — turno agente: plan → tool → synthesize

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
