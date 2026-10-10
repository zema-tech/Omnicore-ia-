---
name: monitor-budget
description: Tieni i costi LLM sotto controllo
---

Quando l'utente chiede costi, consumi o budget:
1. budget.status: spesi oggi, chiamate, alert 80%, cheap attivo o no.
2. Se OVER senza cheap: proponi OMNICORE_LLM_CHEAP_MODEL o pausa task pesanti.
3. Se vicino al limite: suggerisci task piccoli e sintesi brevi.
4. Mai chiamate LLM extra per misurare: leggi solo il tracking esistente.
