# packages/ — organi di Omnicore

Ogni cartella è un **organo** dell’agente, non un prodotto terzi.

| Package | Ruolo | Origine (studio, non runtime) |
|---------|--------|-------------------------------|
| [`core`](core/) | loop, identità, sessione, piano | nucleo Omnicore |
| [`code`](code/) | mani: file, shell, agent multi-step | OpenCode / Claude Code |
| [`memory`](memory/) | recall, fatti, skill, vault | Hermes |
| [`presence`](presence/) | canali, cron, annunci | OpenClaw |

**Runtime attuale:** l’esecuzione vive ancora in `omnicore/src/` (faculties + modules).
Questi package definiscono il confine pubblico e ospitano il nuovo organo `code` multi-step.
I vendor in `/vendors` restano solo riferimento.
