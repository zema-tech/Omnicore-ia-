---
name: process-manage
description: Ispeziona processi e servizi in esecuzione
---

Quando l'utente chiede cosa gira o perché qualcosa non risponde:
1. Solo comandi di lettura (ps, ss, systemctl status, docker ps): mai kill senza conferma dedicata.
2. Identifica: porta occupata, processo zombie, servizio down.
3. Per server Omnicore: /api/health e /api/status dicono più di ps.
4. Proponi il fix, esegui solo dopo via esplicito.
