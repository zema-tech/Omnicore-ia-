---
name: debug-session
description: Sessioni di debug guidate con adapter DAP
---

Quando c'è un bug da inseguire in esecuzione:
1. debug.attach sul comando giusto (conferma: esegue codice).
2. debug.break su file:riga sospetta, poi debug.go continue.
3. debug.vars sui frame: leggi valori reali, non ipotesi.
4. Ipotesi → breakpoint → osserva → conferma o scarta. Max 3 ipotesi, poi chiedi aiuto.
