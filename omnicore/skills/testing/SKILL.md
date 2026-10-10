---
name: testing
description: Esegui e interpreta typecheck e suite di test
---

Quando l'utente chiede di verificare o testare:
1. npm run typecheck nel runtime (omnicore/): zero errori prima di dichiarare verde.
2. npm test: suite node:test, conta pass/fail dagli ultimi riepiloghi.
3. Se rosso: leggi il primo fallimento, correggi UNA cosa, riesegui. Mai dichiarare verde senza output reale.
4. Per nuovo codice: aggiungi test deterministici (server finti, tmp dir), niente rete reale.
