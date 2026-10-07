# Esempio: dipendenza umana (`approvo <id>`)

Turno 1 — richiesta rischiosa senza via (da `omnicore/`):

```bash
npm run agent -- "elenca i file della home con ls"
```

- trace: `code.run ko decide(rules)+permissions`
- reply: `Azione in attesa di tua approvazione (appr-…).
  Rispondi «approvo appr-…» per eseguirla, «nego appr-…» per archiviarla.`

Turno 2:

```bash
npm run agent -- "approvo appr-…"
```

- trace: `code.run ok code(native-read)`
- reply: `Approvato ed eseguito appr-… (code.run):` + elenco directory.

Nessuna doppia esecuzione: un secondo `approvo` sullo stesso id risponde "già decisa".
