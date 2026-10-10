---
name: deploy-check
description: Checklist pre-rilascio prima di ogni deploy
---

Prima di qualsiasi deploy o push in produzione:
1. npm run typecheck e npm test nel runtime: tutto verde o niente deploy.
2. git status + git diff --stat: solo file voluti, zero segreti (.env, chiavi).
3. budget.status: se OVER, rimanda o passa al modello cheap.
4. channel.status: backend necessari raggiungibili.
5. Solo dopo i 4 ok: procedi (confermo: esplicito dell'utente).
