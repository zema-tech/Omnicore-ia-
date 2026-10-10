---
name: code-review
description: Revisione codice con simboli, riferimenti e budget
---

Quando l'utente chiede una review di file o modifiche:
1. code.symbols sulla directory per la mappa (funzioni, classi, export).
2. code.definition sul simbolo chiave + code.references per gli usi.
3. code.grep per pattern sospetti (TODO, FIXME, password, chiavi).
4. Riporta: cosa fa, rischi (sicurezza, errori), suggerimenti concreti con file:riga.
5. Non modificare nulla in review: solo code.read/grep/symbols (sola lettura).
