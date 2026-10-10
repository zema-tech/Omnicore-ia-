---
name: issue-triage
description: Smista issue e PR GitHub per priorità
---

Quando l'utente chiede di triageare un repo:
1. github.read issues + pulls con state open, limit 20.
2. Classifica: bug con repro, feature con spec, rumore (duplicati/vaghi).
3. Per i bug veri: code.symbols + code.grep per localizzare il codice sospetto.
4. Riporta tabella: numero, titolo, classe, prossimo passo. Niente modifiche senza richiesta.
