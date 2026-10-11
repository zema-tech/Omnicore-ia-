---
name: backup-verify
description: Verifica che i backup siano ripristinabili
---

Un backup non testato non esiste:
1. Lista cosa dovrebbe coprire (vault, sqlite, json di stato).
2. Controlla date e dimensioni: recente e non vuoto.
3. Prova restore in tmp (mai sopra i dati veri) e leggi un file.
4. Solo dopo: dichiara verificato con data e percorso.
