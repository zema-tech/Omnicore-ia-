# Esempio: mani native (write) con conferma

Comando (da `omnicore/`, `OMNICORE_WORKSPACE` = dir di prova):

```bash
OMNICORE_WORKSPACE=/tmp/omnicore-test npm run agent \
  -- "confermo: scrivi un file hello in /tmp/omnicore-test con contenuto ciao mondo da Omnicore"
```

Output reale:

- trace: `memory.search ok → code.run ok code(native-write) → respond ok`
- reply: `Ho lavorato sul codice: scritto …/hello.txt (22 char)`
- file su disco: `ciao mondo da Omnicore`

Senza `confermo` la stessa richiesta viene bloccata da `decide(rules)` e la reply
spiega come approvare. OpenCode non viene chiamato.
