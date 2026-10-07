# apps/server

API HTTP di Omnicore (chat, agent, sessioni).

```bash
cd omnicore
npm run serve
# → http://127.0.0.1:8100
```

Codice: `omnicore/server.py` (guscio) + loop TypeScript in `omnicore/src/agent/`.
Bearer obbligatorio in produzione (vedi `SECURITY.md`).
