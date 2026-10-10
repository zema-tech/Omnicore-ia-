# Omnicore per VS Code

Chat e agente Omnicore dentro l'editor. Zero dipendenze: parla via HTTP con
`npm run serve` (stessi endpoint della dashboard).

## Installazione (senza store)

```bash
cd omnicore/vscode-extension
npx --yes vsce package        # oppure: zip, vedi sotto
code --install-extension omnicore-vscode-0.1.0.vsix
```

Senza `vsce`: copia la cartella in `~/.vscode/extensions/omnicore-vscode-0.1.0/`
e riavvia VS Code.

## Setup

1. Avvia il server: `cd omnicore && OMNICORE_API_TOKEN=xxx npm run serve`
2. In VS Code imposta `omnicore.url` (default `http://127.0.0.1:8100`) e
   `omnicore.token` (= `OMNICORE_API_TOKEN`).
3. `Ctrl+Shift+P` → `Omnicore: apri chat`.

## Comandi

- **Omnicore: apri chat** — webview con token live (SSE) e tool visibili.
- **Omnicore: chiedi all'agente** — input rapido, risposta in documento a lato.
- **Omnicore: invia selezione all'agente** — manda il codice selezionato in chat.

La barra mostra il cervello attivo (`omnicore:api|local|euristica`).

## Verifica manuale

- [ ] chat risponde in streaming a "ciao"
- [ ] `confermo: crea …` propone/esegue come in dashboard
- [ ] selezione inviata con contesto file
- [ ] senza token: errore onesto "non autorizzato"
