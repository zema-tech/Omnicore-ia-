# @omnicore/web — chat Omnicore (React + Vite)

Layout ispirato a grok.com (solo pattern UX, brand solo Omnicore):
landing centrata “Cosa esploriamo?”, card input flottante, chat a colonna
unica, timeline tool collassabile, dark mode opzionale (default light).

## Sviluppo

```bash
# terminale 1 — runtime Omnicore (default http://127.0.0.1:8100)
cd omnicore && npm run serve

# terminale 2 — web dev (proxy /api verso il runtime)
npm run web
# oppure: npm run dev --workspace @omnicore/web
# apri http://127.0.0.1:5173
```

Override target proxy: `OMNICORE_API_URL=http://127.0.0.1:8100 npm run web`.

## Produzione

```bash
npm run build --workspace @omnicore/web   # genera apps/web/dist
cd omnicore && npm run serve              # server.py serve dist/ se presente
```

Il server esistente (`omnicore/server.py`) serve `apps/web/dist` in
produzione con fallback a `dashboard.html` (CLI/TUI/API invariate).

## Note

- Auth Bearer salvata solo in `localStorage` (`omnicore_token`), campo in ⚙.
- SSE su `POST /api/chat/stream`, stesso protocollo di `dashboard.html`.
- Stato cervello/budget da `/api/doctor` + `/api/status` (mai segreti).
