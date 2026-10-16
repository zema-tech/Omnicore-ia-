# Changelog

## Tappa 61 — README solo-omnicore + smoke
Quickstart riscritto con soli comandi `omnicore …`: clone senza
submodule, `npx omnicore init`, `npx omnicore doctor`,
`npx omnicore code "…"`, `npx omnicore serve`. Rimosso ogni
riferimento a `vendors/` (sotto-moduli cancellati). Sezione Doctor
aggiornata (10 check con `init`). Smoke: `version`, `help`,
`doctor --offline`, `status --json`, `skills` verdi da binario.

## Tappa 60 — Agency minima
Nuovo modulo `modules/agency.ts`: `splitGoal` divide un obiettivo in
2–3 sub-task (research + code, più verifica se lungo) e `runAgency`
li esegue via `agentFanout` esistente (mai throw, report con
riepilogo). Sottocomando `omnicore agency "<goal>"` (exit 2 senza
obiettivo, exit 1 se il report fallisce). Test sullo split, nessun
test di esecuzione (serve LLM/rete).

## Tappa 59 — Init + check in doctor
Nuovo sottocomando `omnicore init`: crea `omnicore.config.json`
(default profilo light, zero behavior change) e `data/` + `data/vault`
se mancanti, idempotente, mai sovrascrive. Il doctor guadagna il
10° check `init` (ok se config presente, avviso + hint `omnicore init`
altrimenti); `--fix` delega a init con gli stessi messaggi di prima.

## Tappa 58 — CLI estesa
Sei nuovi sottocomandi: `serve` (python3 server.py [--port]),
`web` (vite dev in apps/web), `chat`, `tui`, `gateway` (MCP stdio)
via spawn con stdio inherit, e `code <obiettivo>` che esegue runAgent
e stampa la reply (exit 2 senza obiettivo, 1 se abort/errore).
Help aggiornata, flag `--*` storici intatti.

## Tappa 57 — CLI base
Nuovo dispatcher `src/cli.ts` + binario `bin/omnicore.js` (campo
`bin` in package.json): sottocomandi `version`, `help`, `doctor`
(--fix/--json/--offline, exit 1 se errori), `status` (+--json),
`skills [list]` (+--json), exit 2 per comando sconosciuto. `index.ts`
delega alla CLI unificata se il primo argomento è un sottocomando
noto; tutti i flag storici restano invariati.

## Tappa 56 — Omnicore doctor
`npm run doctor` ora è una diagnostica completa (pattern `hermes doctor`,
solo Omnicore): 9 check (node, config, sicurezza, workspace, dati, skill,
canali, budget, LLM) con livelli ok/avviso/errore, hint di fix, `--fix`
sicuro (crea solo `data/` mancanti), `--json`, `--offline`, exit 1 se
errori. `GET /api/doctor` ritorna gli stessi `checks` (campi storici
intatti) e la pagina Stato li mostra. Mai throw, mai segreti in output.

## Tappa 55 — code.task LLM multi-step
Con `OMNICORE_LLM_*` attivo il modello propone step JSON
(`list/read/write/edit/shell/grep/glob/done`) eseguiti in workspace jail
fino a `done` o `budgetSteps` (`OMNICORE_CODE_BUDGET_STEPS`, default 8).
Offline o in fail resta l'euristica (mai throw). Ritorno invariato più
`timeline`. Test con mock LLM (`code_llm.test.ts`).

## Tappa 54 — Dashboard React stile Hermes
Nuova dashboard `apps/web` (React + TS + Tailwind, pattern studiato da
`vendors/hermes/web` con palette/codice originali, brand solo Omnicore):
shell con sidebar (Chat, Sessioni, Stato, Skill, Canali, Impostazioni),
chat SSE `/api/chat/stream` con card tool + interrupt, stato
(`doctor` + budget, mai segreti), skill da `/api/skills`, canali da
`/api/channels`, settings con Bearer localStorage, tema dark teal + light.
`npm run web` (proxy /api), `npm run web-build` + `server.py` serve
`dist/` con fallback legacy. Backend esteso senza rotture: flag
`--skills`/`--channels`, endpoint `/api/skills` e `/api/channels`.
CLI/TUI/MCP intatti.

## Tappa 53 — 52 skill pack
Da 32 a 52: onboarding, review, incidenti, migrazioni, costi, modelli,
traduzioni, followup. Tutti validati da test + curator.

## Tappa 52 — Announce verificato
Test end-to-end: channel.announce consegna davvero a signal, discord e
telegram (confermati). Nessun buco nel routing.

## Tappa 51 — Catalogo plugin
`plugins-catalog.json` con tier, `plugin.search/install`, esempi
hello-world + vault-stats, `docs/plugins.md` completa.

## Tappa 50 — Plugin manager + SDK
Manifest, import dinamico, ctx con tool/hook/llm-senza-chiavi, hook
`turn_end` nel loop, CLI `--plugins`, fiducia dichiarata (niente sandbox).

## Tappa 49 — Matrix, Google Chat, Teams
Matrix send + sync long-poll, Google Chat via webhook, Teams via Graph
(client-credentials). 11 backend in `channel.announce`. Ricezione Teams
richiede endpoint bot (documentato).

## Tappa 48 — Collaborazione
Presence heartbeat con prune, share ACL (owner/editor/viewer) per sessioni,
tool dedicati. Enforcement HTTP futuro (server mono-Bearer).

## Tappa 47 — Long-running
Task persistenti: schedule → slice con checkpoint → resume → finish/cancel.
Esecuzione bounded, runAt onesto, niente demone (vedi cron).

## Tappa 46 — Google + Spotify
Gmail send/list, Calendar list/create, Spotify search/state/control via
token utente. Scritture con conferma.

## Tappa 45 — Workboard
Coda persistente con priorità e dipendenze, claim atomico, handoff con
contesto, monitoraggio attivi/bloccati.

## Tappa 44 — Debugger DAP
Client DAP generico via stdio + `debug.attach/break/go/vars`. Provato
contro adapter finto con framing reale. Esecuzione con conferma.

## Tappa 43 — MCP server mode
`npm run mcp-serve`: Omnicore come server MCP stdio (tools/list-call,
resources sessions/skills/doctor). Pronto per Claude Desktop/Cursor.

## Tappa 42 — STT audio
Trascrizione whisper.cpp o OpenAI + `meeting.attach` (audio→segmenti live).
Niente microfono/streaming: serve hardware esterno.

## Tappa 41 — Signal
Backend via signal-cli esterno (send/poll/parse). Senza binary: istruzioni
oneste. Stesso pattern di Ollama e tsserver.

## Tappa 40 — 32 skill pack
Da 8 a 32 pack (produttività, sistema, dev, research), tutti validati.

## Tappa 39 — WhatsApp + Email nativi
WhatsApp Cloud API (invio + parser/verify webhook) ed Email IMAP/SMTP
scritti a mano (STARTTLS obbligatorio, PEEK senza segnare letto).
Signal resta fuori: serve binary esterno. Tool con conferma per gli invii.

## Tappa 38 — Memoria attiva
Auto-learn conservativo nel loop (fatti espliciti, dedup, max 3/turno,
kill-switch `OMNICORE_ACTIVE_MEMORY=0`), conteggio in `learned`.

## Tappa 37 — Meeting live
`meeting.start/append/status/end/list`: timeline, action item automatici,
archivio Markdown in vault. Niente audio/STT: serve hardware/dipendenze.

## Tappa 36 — Decisioni pesate
`decision.evaluate` deterministico (budget, priority, custom), report con
pesi e raccomandazione. Solo lettura.

## Tappa 35 — GitHub reader
`github.read`: issues, pulls, commits, diff (PR/commit), token opzionale.
Solo lettura: niente conferma (regola letture).

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
