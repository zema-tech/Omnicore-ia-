# apps/ — superfici Omnicore

| App | Ruolo | Comando |
|-----|--------|--------|
| [`cli`](cli/) | turno agente da terminale | `npm run agent -- "…"` |
| [`server`](server/) | API HTTP + sessioni | `npm run serve` |
| [`dashboard`](dashboard/) | UI web unica | apre con il server su :8100 |

Implementazione runtime: ancora in `omnicore/` (`server.py`, `dashboard.html`, `src/index.ts`).
Questa cartella è il confine prodotto: un posto chiaro in root per ogni superficie.
