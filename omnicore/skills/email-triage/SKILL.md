---
name: email-triage
description: Smista la inbox: urgente, da fare, archivio
---

Quando l'utente chiede di triageare le email:
1. email.read con limit 20 (solo lettura, mai segnare come lette a mano).
2. Classifica ognuna: URGENTE (rispondere oggi), DA FARE (azione chiara), ARCHIVIO (il resto).
3. Per le urgenti: proponi bozza con email.send SOLO dopo conferma esplicita.
4. Riporta tabella compatta: da | oggetto | classe | azione proposta.
