# Contribuire a Omnicore-ia

## Regole

1. **Core in TypeScript** (`omnicore/src/`). Python/Rust/Bash solo client o legacy marcato.
2. **Ogni funzione un modulo**: capacità nuove in `omnicore/src/modules/`, tool in `src/agent/tools.ts`.
3. **Test prima del commit**: `npm run typecheck && npm test` dentro `omnicore/`. Mai dichiarare fatto ciò che non è eseguito.
4. **Un commit per tappa**, messaggio chiaro. Niente force push.
5. **Niente segreti**: `.env`, chiavi, token mai nel repo (solo `.env.example`).
6. **`vendors/` mai editato a mano**: solo submodule.

## Struttura

```
omnicore/src/agent/      loop, piano, tool
omnicore/src/modules/    capacità native (canali, cron, agenti, ...)
omnicore/src/faculties/  memoria, codice, presenza
omnicore/src/decide/     regole → Jev → CLM
omnicore/src/mind/       LLM + sintesi
omnicore/tests/          suite node:test
docs/                    architettura, deploy
```

## Profili

`light` (default, API + file) · `medium` (+mondo) · `alt` (+CLM) via `OMNICORE_PROFILE`.
