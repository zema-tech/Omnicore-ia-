# Studio dei 3 — architettura portata in Omnicore

Studio completo (ottobre 2026) di `vendors/hermes` (NousResearch/hermes-agent),
`vendors/opencode` (anomalyco/opencode) e `vendors/openclaw` (openclaw/openclaw).
I vendor restano **solo riferimento**: qui sotto cosa abbiamo imparato e cosa
è già fuso in `omnicore/src/` (nativo, zero dipendenze).

## Hermes Agent — memoria, skill, permessi a piani

- **Sessioni append-only** (`hermes_state_sessions.py`, `agent/session_persistence.py`):
  upsert che non sovrascrive mai, dedup via marker, lineage fork/compression.
  → Fuso base in `modules/sessions.ts` (JSON). Manca: SQLite/WAL, marker, lineage.
- **Skill progressive-disclosure** (`agent/skill_utils.py`, `tools/skills_tool.py`):
  l'indice mostra solo `name+description`, il corpo si carica con `skill_view`
  e va come messaggio utente (mai system, cache-safe); tier e quarantine.
  → Fuso in `modules/skills.ts` (list/get/search/create). Manca: tier, quarantine, curator.
- **Permessi a piani** (`tools/approval*.py`): deny-glob > hardline > allowlist >
  yolo > prompt, coalescing, breaker dopo 3 deny.
  → Fuso base in `modules/permissions.ts` + `decide/rules.ts`. Manca: deny-glob,
  classificazione comandi, yolo per-sessione.
- **Compaction** (`agent/conversation_compression.py`): prune senza LLM, summary
  via side-LLM, rotazione sessione con lineage. → Da fare (`compaction.ts`).
- **Cron** (`cron/scheduler.py`): tick avanza `next_run_at` prima del dispatch
  (at-most-once), lock, dedup cross-profile. → Fuso base in `modules/cron.ts`.
  Manca: retry/backoff, receipt, espressioni cron+tz, demone tick nel server.

## OpenCode — loop, tool, subagent

- **Loop ReAct `while(true)`** (`session/prompt.ts:runLoop`): continua finché ci
  sono tool-call, break su finish/stop/overflow→compaction, `MAX_STEPS` con
  avviso prima dello stop. Errori tool → contesto, mai crash; retry solo 429/5xx.
  → Fuso in `agent/loop.ts` (giri con budget) + `plan.ts` (plan/followup).
- **Tool registry tipizzata** (`tool/registry.ts`, `tool/tool.ts`): schema-first,
  truncate output automatico, permessi per `(permesso, pattern)` con wildcard e
  `Deferred` sospensivo. → Fuso base in `agent/tools.ts` + `decide/rules.ts`.
  Manca: validazione argomenti model-facing, truncate con spill, Deferred.
- **Subagent isolato** (`tool/task.ts`): sessione figlia con permessi ridotti,
  eredita solo prompt+summary, resa come `<task_result>`.
  → Fuso in `agents.run` (secondario file-worker via `code.task`).
- **Sessioni + slash** (`session.ts`, `compaction.ts`, `command/index.ts`):
  fork economico, compaction come task, slash come template→prompt.
  → Da fare: fork, compaction, slash unificati.

## OpenClaw — gateway, Telegram, cron durevole

- **Gateway WS/HTTP + RPC** (`gateway/server*.ts`): `chat.send`, broadcast,
  auth/pairing. → Da noi: `server.py` (guscio) + loop in-proc. Manca: WS, RPC tipato.
- **Telegram** (`extensions/telegram`): `POST {base}/bot<token>/<method>`,
  long-poll `getUpdates` (offset dopo commit), `sendMessage` chunk 4096,
  throttler flood-wait, routing `(account, chat, thread)`→sessione.
  → Fuso in `modules/telegram.ts` (send/poll/me) + `channels.ts` + tool
  `telegram.me/poll` e invio via `channel.announce`. Manca: demone polling→risposta,
  throttler, thread/topic, media.
- **Cron durevole** (`cron/service.ts`): SQLite, un solo timer, retry 5s/10s/20s,
  receipt. → Vedi Hermes sopra.
- **Canvas/artefatti** (`canvas/`): hosting con CSP. → Da fare.

## Roadmap (ordine)

1. ✅ ReAct, BYOK, browser, skill-create, Telegram send/poll, agents.run
2. ✅ MCP client, memoria SQLite FTS5, code intelligence, streaming SSE, web.search
3. ✅ Fanout multi-agente, chat interattiva, Discord+Slack, curator skill, budget LLM
4. ✅ Dashboard live, embedding locali, deep research, cookbook (stile Odysseus, nativo)
5. ✅ Skill precaricate, video FAL, interrupt, estensione VS Code, TUI ANSI
6. Demone `tick()` nel server + polling Telegram→`runAgent`→risposta
5. Subagent con sessione figlia vera + permessi ridotti
6. Compaction/prune contesto + fork sessioni
7. Deny-glob comandi + yolo per-sessione
8. WhatsApp reale, throttler, media, marketplace skill
