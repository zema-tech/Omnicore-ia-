---
name: dependency-audit
description: Controlla dipendenze obsolete e vulnerabili
---

Quando si parla di dipendenze:
1. npm outdated + npm audit (lettura): lista cosa è vecchio o bucato.
2. Aggiorna una cosa alla volta, test dopo ognuna.
3. Zero dipendenze runtime è la regola del core: ogni aggiunta va giustificata.
4. Mai aggiornamenti ciechi prima di un deploy.
