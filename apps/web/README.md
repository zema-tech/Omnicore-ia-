# @omnicore/web — dashboard Omnicore (React + Vite + Tailwind)

Pattern UX studiato dalla Hermes Web Dashboard (`vendors/hermes/web`,
solo struttura: shell con sidebar, pagine, streaming + card tool, temi),
con palette, nomi e codice originali Omnicore.

## Pagine

- **Chat** — SSE `POST /api/chat/stream` (token live + card tool
  `tool_start/tool_end`), pannello sessioni, interrupt, composer con
  supporto `confermo:`
- **Sessioni** — elenco + riuso in chat (storico unico `data/sessions.json`)
- **Stato** — `/api/doctor` + `/api/status` (cervello, budget, mai segreti)
- **Skill** — `/api/skills` (52 pack da `omnicore/skills/`, con filtro)
- **Canali** — `/api/channels` (stato backend, mai token)
- **Impostazioni** — Bearer in `localStorage`, base URL backend opzionale

## Sviluppo

```bash
# terminale 1 — runtime Omnicore (default http://127.0.0.1:8100)
cd omnicore && npm run serve

# terminale 2 — dashboard dev (proxy /api verso il runtime)
npm run web
# apri http://127.0.0.1:5173
```

Prima volta: `npm install --workspace @omnicore/web`.
Override proxy: `OMNICORE_API_URL=http://127.0.0.1:8100 npm run web`.

## Produzione

```bash
npm run web-build     # genera apps/web/dist (gitignored)
cd omnicore && npm run serve   # serve dist/ con fallback a dashboard.html
```

Router in hash (`#/status`, …): niente 404 al refresh dietro `server.py`.
Tema dark teal di default, light opzionale (toggle in header).
