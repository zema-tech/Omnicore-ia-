# Omnicore-ia

**Omnicore** è un'IA agente — non un orchestratore di prodotti terzi.

Nasce dalle capacità di motori open-source usati come **organi interni**:

| Organo Omnicore | Motore | Funzione |
|-----------------|--------|----------|
| `memory.*` | [Hermes Agent](vendors/hermes) | memoria, skill, recall |
| `code.*` | [OpenCode](vendors/opencode) | coding |
| `channel.*` | [OpenClaw](vendors/openclaw) | presenza, canali, ops |
| `world.*` | [Mirage](https://github.com/strukto-ai/mirage) (da collegare) | VFS / terminal virtuale |
| `decide.*` | [CLM](https://github.com/Contrastive-LM/CLM) (da collegare) | rank/verify azioni |

L'utente parla solo con **Omnicore**. I vendor non compaiono in facciata.

Vedi [`omnicore/ARCHITECTURE.md`](omnicore/ARCHITECTURE.md).

## Quickstart

```bash
git clone --recurse-submodules https://github.com/zema-tech/Omnicore-ia-.git
cd Omnicore-ia-/omnicore
cp .env.example .env   # opzionale

# Turno IA (nucleo agente)
npm run agent -- "fix login bug"
npm run agent -- "ricordi cosa abbiamo fatto"

# API + dashboard
npm run serve
# → http://127.0.0.1:8100
```

Legacy (pipeline esplicita): `npm run fuse -- "…"`.

## Nucleo agente

```
omnicore/src/agent/
  identity.ts   # chi è Omnicore
  tools.ts      # tool unificati → organi
  loop.ts       # plan → tool → risposta
```

```bash
npm run agent -- "ciao"
```

## Struttura

```
omnicore/
  src/agent/      ← nucleo IA
  src/adapters/   ← organi (hermes, opencode, openclaw)
  server.py       ← API + dashboard + sessioni
  omniling/       ← DSL opzionale .omni
vendors/          ← submodule (non editare a mano)
```

## Aggiungere CLM e Mirage

```bash
cd Omnicore-ia-
git submodule add --depth 1 https://github.com/Contrastive-LM/CLM.git vendors/clm
git submodule add --depth 1 https://github.com/strukto-ai/mirage.git vendors/mirage
git commit -m "vendors: clm + mirage"
git push
```

Poi implementare `adapters/clm.ts` e `adapters/mirage.ts` collegati a `decide.*` e `world.*`.
