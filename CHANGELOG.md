# Changelog

## Tappa 13 — Il principale crea skill
`skills.create {name, description, instructions}`: il loop scrive nuove
SKILL.md riusabili (conferma + decide come le scritture). Validazione
nomi, niente sovrascritture silenziose.

## Tappa 12 — Loop ReAct multi-giro
Con LLM il turno continua: osserva i risultati, ripianifica, si ferma su `[]`
o a budget (`OMNICORE_MAX_ROUNDS`, default 4). Offline resta a giro singolo.
Conferme e decide valgono a ogni giro.

## Tappa 11 — Browser nativo (web.fetch)
Legge pagine pubbliche (html→testo+link, json) con anti-SSRF, redirect
rivalidati e timeout. Tool nel loop, nessuna conferma (sola lettura).

## Tappa 10 — Coding agent nativo
Edit con diff preview, glob/grep, todo. OpenCode solo fallback.

## Tappa 9 — Dipendenza umana
`approvo <id>` / `nego <id>` eseguono o archiviano azioni registrate.

## Tappa 8 — Fusione Hermes
Sessioni, permessi e skill nativi in `src/modules`.

## Tappa 7 — Fusione OpenClaw
Canali, cron e agenti nativi in `src/modules`.

## Tappa 6 — Sicurezza
Bearer obbligatorio (fail-closed) + conferma esplicita azioni distruttive.

## Tappa 5 — Vault cervello
Note Markdown `[[link]]` in `data/vault`, richiamate prima di ogni risposta.

## Tappa 4 — Profili
`light/medium/alt` via config, stesso core.

## Tappa 3 — Decide a cascata
Regole locali → Jev API → CLM GPU, verify nel loop.

## Tappa 2 — Piano con LLM
Tool-calling con provider api/locale, fallback keyword.

## Tappa 1 — Un solo loop
`server.py` guscio HTTP del loop TS; test automatici; mente solo TypeScript.

## Tappa 0 — Mind e facoltà
Identità unica, memoria unificata, sintesi LLM/euristica, facoltà memory/code/channel.
