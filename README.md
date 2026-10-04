# Omnicore-ia

Fusione di tre progetti open-source in un unico orchestratore poliglotta:

| Ruolo | Progetto | Cosa fa |
|---|---|---|
| 🧠 Brain | [Hermes Agent](vendors/hermes) | memoria, conversazioni, canali, cron |
| 🙌 Hands | [OpenCode](vendors/opencode) | coding task (server `serve` o CLI `run`) |
| 🗣️ Face | [OpenClaw](vendors/openclaw) | gateway, policy, ops |

Il router classifica ogni input (`code` / `memory` / `ops` / `chat`) e la
pipeline `--fuse` esegue **brain → hands → face**, con ogni step best-effort:
se un servizio è spento, gli altri vanno avanti comunque.

## Quickstart

```bash
git clone --recurse-submodules https://github.com/zema-tech/Omnicore-ia-.git
cd Omnicore-ia-/omnicore
cp .env.example .env   # opzionale: i default localhost bastano
npm run fuse -- "ciao"
```

Altri entrypoint equivalenti: `fuse:py` (Python), `fuse:sh` (Bash),
`fuse:rs` (Rust). Dettagli deploy su qualsiasi host in [`omnicore/DEPLOY.md`](omnicore/DEPLOY.md).

## Struttura

```
omnicore/
  src/            core TypeScript (router, pipeline, adapters, config)
  omnicore_py/    mirror Python (stdlib only)
  omnicore_rs/    mirror Rust (zero dipendenze)
  scripts/        hermes_bridge.py + orchestratore Bash
  DEPLOY.md       guida deploy · .env.example · omnicore.config.json
vendors/          submodule: hermes, opencode, openclaw (mai editare a mano)
```

## Come funziona

- **Brain**: `scripts/hermes_bridge.py` importa direttamente gli handler di
  `vendors/hermes/mcp_serve.py` (stdlib, niente SDK MCP, niente demone).
- **Hands**: `opencode serve` via HTTP, fallback su `opencode run --format json`.
- **Face**: `POST /api/v1/admin/rpc` con metodi allowlist (`status`,
  `commands.list`, `cron.*`, `agents.*`, `channels.status`).
