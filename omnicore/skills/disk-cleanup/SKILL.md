---
name: disk-cleanup
description: Pulizia disco sicura senza rm ricorsivi
---

Quando serve spazio o pulizia:
1. Mappa prima: code.shell "du -sh" sulle dir sospette (node_modules, target/, dist/).
2. Solo cancellazioni non ricorsive e mirate (rm <file>), mai rm -r (bloccato dal guard).
3. Rigenera dopo: npm ci / build per verificare che tutto funzioni ancora.
4. Mai toccare data/vault, *.sqlite, .env, vendors/.
