# Omnicore-ia — un unico agente IA

**Omnicore** è un agente IA con un solo loop (`piano → strumenti → risposta`),
identità propria e organi nativi. Nasce studiando
[Hermes](vendors/hermes), [OpenCode](vendors/opencode) e [OpenClaw](vendors/openclaw),
ma **non li orchestra come prodotti esterni**: fonde le capacità in moduli propri.

## Root del monorepo

```
apps/           superfici: cli · server · dashboard
packages/       organi: core · code · memory · presence
  code/         Claude Code di Omnicore (agent multi-step nativo)
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

## Documentazione

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — organi e loop
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — host qualsiasi
- [`AGENTS.md`](AGENTS.md) · [`SECURITY.md`](SECURITY.md) · [`CHANGELOG.md`](CHANGELOG.md)
