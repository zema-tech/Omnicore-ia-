---
name: pr-review
description: Revisione pull request con diff e contesto
---

Quando l'utente chiede di revisionare una PR:
1. github.read diff con repo e number: leggi tutto il diff prima di parlare.
2. code.definition sui simboli toccati per capire l'impatto fuori dal diff.
3. Giudizio per file: ok / dubbio (spiega) / blocco (bug o sicurezza, con riga).
4. Mai approvare o mergiare da qui: solo code.read, niente push.
