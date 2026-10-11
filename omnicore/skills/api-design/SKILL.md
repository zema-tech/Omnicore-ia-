---
name: api-design
description: Disegna API piccole e oneste
---

Quando serve un endpoint o un tool nuovo:
1. Firma prima: input, output, errori (come i nostri {ok, via, data|error}).
2. Niente throw verso il chiamante: errori strutturati sempre.
3. Versiona e documenta con esempio copiabile.
4. Un test per caso felice + uno per errore prima di dichiarare finito.
