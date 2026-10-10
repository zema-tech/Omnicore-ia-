---
name: refactor-plan
description: Piani di refactor sicuri a piccoli passi
---

Prima di ristrutturare codice:
1. code.symbols + code.references: mappa chi usa cosa, niente tagli al buio.
2. Piano in passi reversibili, ognuno con verifica (typecheck/test).
3. Un passo alla volta con conferma; test verdi tra un passo e l'altro.
4. Mai refactor + feature insieme: prima sposti, poi cambi comportamento.
