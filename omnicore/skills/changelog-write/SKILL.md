---
name: changelog-write
description: Scrivi voci changelog per tappa
---

A fine tappa di lavoro:
1. git log --oneline e git diff --stat per i fatti (non la memoria).
2. Voce breve: cosa, file chiave, verifiche (test/typecheck con numeri reali).
3. Un commit per tappa, messaggio imperativo in italiano o inglese coerente.
4. Mai forzare push su divergenza: fetch + rebase prima.
