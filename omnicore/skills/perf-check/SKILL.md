---
name: perf-check
description: Controlli di performance guidati e onesti
---

Quando qualcosa è lento:
1. Misura prima (time, log, budget): niente ottimizzazioni al buio.
2. Trova il collo reale: I/O, loop, query, payload enormi.
3. Un fix alla volta, rimisura dopo: se non migliora, revert.
4. Riporta numeri prima/dopo, non sensazioni.
