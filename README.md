# Omnicore-ia — un unico agente IA

**Omnicore** è un agente IA con un loop ReAct (`osserva → agisci`, fino a
`OMNICORE_MAX_ROUNDS` giri con la tua key, giro singolo offline),
identità propria e organi nativi. Nasce studiando
[Hermes](vendors/hermes), [OpenCode](vendors/opencode) e [OpenClaw](vendors/openclaw),
ma **non li orchestra come prodotti esterni**: fonde le capacità in moduli propri.

## Root del monorepo

```
apps/           superfici: cli · server · dashboard · web (React)
packages/       organi: core · code · memory · presence
  code/         Claude Code di Omnicore (agent multi-step nativo, euristico o LLM)
omnicore/       runtime attivo (loop, test, server)
docs/           architettura e deploy
docker/         container
examples/       transcript di turni
vendors/        submodule di riferimento (non editare)
```

## Quickstart

```bash
git clone --recurse-submodules https://github.com/zema-tech/Omnicore-ia-.git
cd Omnicore-ia-
cd omnicore && cp .env.example .env   # opzionale

npm run agent -- "elenca i file"
npm run agent -- "confermo: scrivi file hello.txt con contenuto ciao"
npm test
npm run serve   # http://127.0.0.1:8100
```

## Collega la tua API key (il tuo agente)

Senza key, Omnicore ragiona offline (euristica). Con la tua key diventa
un vero agente (piano + risposta dal modello):

```bash
export OMNICORE_LLM_BASE_URL="https://openrouter.ai/api/v1"  # o Ollama/LM Studio
export OMNICORE_LLM_API_KEY="sk-..."                          # solo env, mai nel repo
export OMNICORE_LLM_MODEL="anthropic/claude-sonnet-4"         # o llama3.1, qwen...
npm run doctor   # verifica: active deve dire "api" (o "local" con Ollama)
npm run agent -- "ciao"
```

Chiavi solo da env (`omnicore/.env.example` le elenca tutte). Senza backend
raggiungibile degrada da solo all'euristica offline.

## Organo code (nativo)

```ts
// packages/code — multi-step, zero OpenCode obbligatorio
import { runCodeAgent } from "./packages/code/src/index.ts";

const r = await runCodeAgent({
  goal: "crea note.md con hello e verifica",
  workspace: "/tmp/omni-ws",
  budgetSteps: 6,
});
console.log(r.summary, r.filesTouched);
```

Path felice: `read` / `write` / `list` / `shell` in jail sul workspace.
OpenCode resta solo boost opzionale nel runtime `omnicore/`.

## Web app (React)

```bash
cd omnicore && npm run serve   # runtime http://127.0.0.1:8100
npm run web                    # dev Vite http://127.0.0.1:5173 (proxy /api)
```

Landing “Cosa esploriamo?”, chat live su `POST /api/chat/stream` (SSE),
timeline tool collassabile, stato cervello/budget, Bearer in settings
(solo `localStorage`). Produzione: `npm run web-build`, poi `npm run serve`
serve `apps/web/dist` con fallback alla dashboard legacy.

## Code agent LLM (opzionale)

```bash
export OMNICORE_LLM_BASE_URL="https://openrouter.ai/api/v1"
export OMNICORE_LLM_API_KEY="sk-..."   # solo env, mai nel repo
# OMNICORE_CODE_BUDGET_STEPS=8         # max step per code.task (default 8)
npm run agent -- "confermo: crea note.md con hello e verifica"
```

Con LLM attivo `code.task` pianifica step JSON
(`list/read/write/edit/shell/grep/glob/done`) in workspace jail fino a
`done` o budget; offline o in fail resta l'euristica (mai throw,
conferme e blocklist invariate).

## Documentazione

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — organi e loop
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — host qualsiasi
- [`AGENTS.md`](AGENTS.md) · [`SECURITY.md`](SECURITY.md) · [`CHANGELOG.md`](CHANGELOG.md)
