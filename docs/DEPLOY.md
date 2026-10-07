# Omnicore — Guida deploy (qualsiasi host)

Omnicore non ha dipendenze da Termux: nessun path hardcoded, tutto via env
con default localhost. Gira su VPS Linux, PC/server di casa, container o PaaS.

## 1. Prerequisiti

| Cosa | Minimo | Nota |
|---|---|---|
| git | qualsiasi | per submodule |
| Node.js | >= 22 | core TS (`--experimental-strip-types`, niente build) |
| Python | >= 3.10, solo stdlib | brain + bridge, zero pip package |
| curl + bash | qualsiasi | orchestratore `.sh` |
| Rust | solo per `omnicore_rs` | `cargo run/test`, altrimenti opzionale |
| `opencode` CLI | per intent=code | da https://opencode.ai, oppure `opencode serve` |
| OpenClaw gateway | per intent=ops/face | default `http://127.0.0.1:18789` |

TypeScript check: `npm run typecheck` (serve solo `npm i` una volta in `omnicore/`).

## 2. Clone

```bash
git clone --recurse-submodules https://github.com/zema-tech/Omnicore-ia-.git
cd Omnicore-ia-/omnicore
# se avevi già clonato senza submodule:
git submodule update --init --depth 1
```

## 3. Env

```bash
cp .env.example .env   # poi compila solo ciò che cambia (mai commit di .env)
```

Variabili (tutte opzionali, default = localhost):
`HERMES_DIR`, `HERMES_PYTHON`, `OPENCODE_URL`, `OPENCODE_SERVER_PASSWORD`,
`OPENCLAW_URL`, `OPENCLAW_TOKEN`, `OMNICORE_HOME` (solo se l'eseguibile Rust
gira fuori albero, es. systemd/docker).

## 4. Avvio servizi esterni (sullo stesso host o altrove)

```bash
opencode serve --port 4096        # hands (oppure lascia stare: fallback su `opencode run`)
openclaw gateway                  # face (porta 18789) — vedi vendors/openclaw/docs
```

Hermes non richiede demoni: il bridge legge `~/.hermes` (o `$HERMES_HOME`)
direttamente via stdlib. Senza stato Hermes, il brain risponde `count: 0` —
pipeline comunque verde sugli altri step.

## 5. Run Omnicore (4 entrypoint equivalenti)

```bash
npm run dev -- "ciao"              # route singola (TS)
npm run fuse -- "fix login bug"   # fusione brain->hands->face (TS)
npm run fuse:py -- "ciao"         # Python
npm run fuse:sh -- "ciao"         # Bash
npm run fuse:rs -- "ciao"         # Rust
```

Esempio output `--fuse`: `{intent, handler, steps:[brain, hands, face]}` —
ogni step ha `ok`/`error`; face `ok:false` = gateway spento, non un bug.

## 6. Note per target

- **VPS/server con systemd**: un unit per servizio (`opencode serve`,
  gateway openclaw) + env via `EnvironmentFile=.env`; per il binario Rust
  compilato (`cargo build --release`) imposta `OMNICORE_HOME=<repo>/omnicore`.
- **Docker**: immagine `node:22-slim` + `python3` + `curl`; copia repo con
  submodule, `npm i --prefix omnicore`, entrypoint a scelta tra i 4 sopra.
  Le porte 4096/18789 vanno pubblicate solo se i servizi girano in altri
  container/host (allora punta le env agli hostname giusti).
- **PaaS (Railway/Render/Fly)**: `OPENCODE_URL`/`OPENCLAW_URL` verso i servizi
  esterni, `HERMES_DIR` al path del checkout; niente stato locale richiesto.
- **Solo code-task senza gateway**: basta `opencode` CLI — brain/face
  degradano da soli a best-effort senza rompere nulla.

## 7. Sanity check post-deploy

```bash
npm run typecheck && npm run fuse -- "ciao"
python3 scripts/hermes_bridge.py channels_list '{}' | head -c 200
curl -s -m 5 -X POST "$OPENCLAW_URL/api/v1/admin/rpc" \
  -H 'Content-Type: application/json' -d '{"id":"ping","method":"status","params":{}}'
```
