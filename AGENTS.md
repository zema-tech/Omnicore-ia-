# AGENTS.md — istruzioni per chi scrive codice in questo repo (umano o agente)

Omnicore-ia è UN agente IA, non un orchestratore. Ogni capacità vive in un modulo
nativo sotto `omnicore/src/`; i vendor in `vendors/` sono solo riferimento.

## Comandi (da `omnicore/`)

```bash
npm run agent -- "…"   # turno del loop (unico path di pensiero)
npm test               # suite node:test, deve stare 100% verde
npm run typecheck      # tsc --noEmit, zero errori
npm run serve          # API + dashboard (guscio HTTP del loop)
```

## Regole

1. **Core solo TypeScript** (`omnicore/src/`). Niente nuova logica in Python/Rust/Bash.
2. **Ogni funzione un modulo**: nuovo codice in `omnicore/src/modules/`, tool in `src/agent/tools.ts`.
3. **Zero dipendenze runtime**: solo built-in Node. Dev solo `typescript` + `@types/node`.
4. **Best-effort**: mai throw verso il loop — errori in `{ok:false, via, output|error}`.
5. **Sicurezza**: scritture/esecuzioni solo con conferma (`needsConfirm`) o approval (`approvo <id>`);
   path sempre dentro il workspace; comandi in blocklist mai eseguiti.
6. **Niente segreti** nel repo (`.env` ignorato, chiavi solo da env). Mai toccare `vendors/`.
7. **Verifica prima di dichiarare**: test eseguiti, output reali nei report. Un commit per tappa.

## Mappa rapida

`agent/` loop+piano+tool · `modules/` canali/cron/agenti/sessioni/permessi/skill/edit/search/todo ·
`faculties/` memoria/codice/presenza · `decide/` regole→Jev→CLM · `mind/` LLM+sintesi ·
`vault/` note · `config.ts` + profili light/medium/alt · `server.py` guscio HTTP.
