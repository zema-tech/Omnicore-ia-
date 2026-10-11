---
name: test-plan
description: Piani di test prima di scrivere codice
---

Prima di feature non banali:
1. Elenca casi: felice, bordi, errori, concorrenza se serve.
2. Per ognuno: dove vive il test e cosa asserisce.
3. Prima il test che fallisce, poi il codice (quando possibile).
4. Niente rete reale nei test: server finti e tmp dir.
