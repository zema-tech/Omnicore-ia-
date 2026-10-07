# @omnicore/core

Cervello dell’agente: un solo turno `plan → tools → synthesize → respond`.

Implementazione attiva oggi:

- `omnicore/src/agent/identity.ts`
- `omnicore/src/agent/loop.ts`
- `omnicore/src/agent/plan.ts`
- `omnicore/src/agent/tools.ts`
- `omnicore/src/mind/`

Questo package è il confine documentale del nucleo; il codice migra qui per pezzi senza rompere gli import esistenti.
