# Esempio: memoria nativa

Comando (da `omnicore/`):

```bash
npm run agent -- "ti ricordi come mi chiamo e cosa preferisco per i deploy?"
```

Output reale (troncato):

```json
{
  "intent": "memory",
  "planner": "keyword",
  "trace": [
    ["memory.search", true, "memory(omnicore+hermes+sessions)"],
    ["respond", true, "omnicore"]
  ],
  "reply": "Dalla mia memoria: ricordati che mi chiamo Zem e preferisco deploy semplici."
}
```

Nessuna chiamata esce dal repo: legge `data/memory.json` + sessioni e risponde.
