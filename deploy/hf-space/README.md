---
title: Omnicore
emoji: 🧠
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# Omnicore

Agente IA unico (loop ReAct, memoria a vault Markdown, organi nativi code · memory · presence).
Il codice vive su GitHub: <https://github.com/zema-tech/Omnicore-ia->. Questo Space lo clona
al build e avvia il server (dashboard + API) sulla porta 7860.

**Secrets da impostare (Settings → Variables and secrets):**

- `OMNICORE_API_TOKEN` — obbligatorio. Senza, le API rispondono 401. Lo scrivi anche nel campo "Bearer token" della dashboard.
- `OMNICORE_LLM_API_KEY`, `OMNICORE_LLM_BASE_URL`, `OMNICORE_LLM_MODEL` — per la vera IA (senza, ragiona offline in modo euristico).
- Opzionali: `TYPESAFE_API_KEY` (Jev), `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, ecc.

Consigliato: tieni lo Space **privato**.
