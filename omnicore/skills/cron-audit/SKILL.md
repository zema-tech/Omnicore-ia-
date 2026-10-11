---
name: cron-audit
description: Revisiona job pianificati e scadenze
---

Quando si parla di automazioni nel tempo:
1. cron.list: cosa è pianificato davvero (non quello che credi).
2. Per ogni job: serve ancora? schedule giusta? payload idempotente?
3. Rimuovi i morti (cron.remove), aggiorna gli storti.
4. Ricorda: senza demone tick niente scatta da solo.
