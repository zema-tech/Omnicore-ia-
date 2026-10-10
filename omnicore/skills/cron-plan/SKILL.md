---
name: cron-plan
description: Pianifica job ricorrenti sensati
---

Quando serve automazione nel tempo:
1. cron.list prima: niente duplicati dello stesso job.
2. Schedule chiara: once con data ISO, every con millisecondi, delay per tra poco.
3. Payload piccolo e idempotente (il job può scattare due volte).
4. Ricorda il limite onesto: i job scattano solo se qualcuno chiama tick (nessun demone attivo).
