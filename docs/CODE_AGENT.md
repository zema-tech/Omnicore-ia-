# Code agent — Claude Code di Omnicore

## Idea

Come Claude ha **Claude Code** e ChatGPT ha **Codex**, Omnicore ha **`code.task`**:
un organo multi-step che lavora sul workspace (list → read → write → shell),
con timeline degli step e conferma umana.

Non è OpenCode in facciata. OpenCode può restare fallback opzionale.

## Flusso

```text
utente: «confermo: crea hello.txt con ciao»
  → plan (keyword o LLM) sceglie code.task
  → decide.verify (conferma ok)
  → runCodeAgent(goal)
  → steps[] + filesTouched + summary
  → synth risponde in prima persona
  → dashboard mostra timeline
```

## Comandi utili

```bash
cd omnicore
export OMNICORE_WORKSPACE=/tmp/omni-ws
npm run agent -- "confermo: crea hello.txt con contenuto ciao"
npm run agent -- "confermo: elenca i file"
```

## Cosa non facciamo (ancora)

- VM hardware (invisible_dots)
- Browser stealth
- Desktop Electron completo (Rakazo)

Workspace jail + shell + diff + timeline bastano per un Claude Code *nativo* leggero.
