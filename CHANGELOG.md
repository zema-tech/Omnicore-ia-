# Changelog

## Tappa 34 — TUI a pannelli ANSI
`npm run tui`: chat | tool | stato, token live, input raw con storia,
slash, Ctrl+C per interrompere. Zero dipendenze (niente blessed/ink).

## Tappa 33 — Estensione VS Code
Chat SSE, ask rapido, invio selezione, status cervello. Plain JS nel repo,
install manuale documentato (non verificabile in CI: checklist in README).

## Tappa 32 — Interrupt mid-turn
`shouldAbort` nel loop (graceful stop con voce `abort`), Ctrl+C in chat,
`POST /api/chat/abort` per i turni streaming.

## Tappa 31 — Video generate
`video.generate` via FAL (submit→poll→download nel workspace, max 100MB),
conferma obbligatoria (costa denaro vero).

## Tappa 30 — Skill precaricate
Sei pack SKILL.md (web-research, code-review, git-workflow, testing,
sys-monitor, deep-notes), tutti validati dal curator.

## Tappa 29 — Cookbook modelli locali
`cookbook.scan/recommend/serve`: hardware via node:os, fit score su catalogo
curato, pull via API Ollama. Senza Ollama: errore onesto con hint.

## Tappa 28 — Deep research
`research.deep`: cerca → legge fonti → sintesi LLM o estrattiva → report
Markdown citato in vault. Budget fonti/profondità.

## Tappa 27 — Embedding locali
`memory.embed` via Ollama, auto-embedding su store/recall con
`OMNICORE_EMBED_MODEL`, rerank coseno. Senza Ollama: solo BM25.

## Tappa 26 — Dashboard live
Chat su `/api/chat/stream` (token live, tool in timeline), pannello stato
(cervello + budget, mai segreti), endpoint `/api/status` + `/api/doctor`.

## Tappa 25 — Budget LLM
Tracking `usage` (reale o stimato) in `llm_usage.jsonl`, `budget.status`,
alert 80%, fallback a `OMNICORE_LLM_CHEAP_MODEL` oltre soglia, stop→euristica.

## Tappa 24 — Curator skill
`skills.audit` (overlap Jaccard, esili, stantie), `skills.prune`,
`skills.compose` (workflow da skill esistenti). Potature con conferma.

## Tappa 23 — Discord + Slack reali
Invio REST (chunk, auth), gateway Discord WS (hello→identify→dispatch),
parser Events Slack, cablati in `channel.announce` + tool dedicati.

## Tappa 22 — Chat interattiva
`npm run chat`: readline con token live, slash (/doctor, /tools, /rounds…),
sessioni salvate in `sessions.json`. Zero dipendenze.

## Tappa 21 — Fanout multi-agente
`agents.fanout`: task paralleli con routing code/research/agente, sessioni
figlie con parent, coordinatore che aggrega. Conferma come i distruttivi.

## Tappa 20 — Web search nativo
`web.search {query, maxResults, provider}`: DuckDuckGo gratis + Exa con key,
fallback automatico. Solo lettura.

## Tappa 19 — Streaming + prompt-cache
`llmChatStream` SSE con fallback, eventi `token/tool_start/tool_end/loop_end`,
`npm run stream`, endpoint `/api/chat/stream`, prefisso prompt byte-stabile.

## Tappa 18 — Code intelligence
`code.symbols/definition/references` su indice nativo + `code.lsp` verso
language server esterni via stdio (conferma).

## Tappa 17 — Memoria strutturata
SQLite + FTS5 BM25 con `memory.store/recall/forget`, rerank coseno opzionale,
fuso in `memory.search` come fonte `store`.

## Tappa 16 — Client MCP nativo
Trasporti stdio + http, `mcp.list/call/reload`, config env o `.mcp.json`,
conferma come i distruttivi.

## Tappa 15 — Secondario file-worker (agents.run)
`agents.run {name, task}`: agente registrato + attivo esegue `code.task`
isolato e riporta `<task_result>` (summary, file, timeline). Conferma una
volta per la delega, decide come i distruttivi.

## Tappa 14 — Telegram reale
`modules/telegram.ts` via Bot API (da studio OpenClaw): invio chunk 4000,
long-poll `getUpdates` con offset, `getMe`. Tool `telegram.me/poll`, invio
via `channel.announce` a chat_id. Token solo env.

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
