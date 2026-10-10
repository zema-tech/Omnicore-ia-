---
name: subagent-brief
description: Delega file-work a un secondario con brief chiari
---

Quando un task file è indipendente dal resto:
1. agents.register se il secondario non esiste (nome + skill utili).
2. Brief in una frase: obiettivo + file + criteri di fatto, non il come.
3. agents.run o agents.fanout per paralleli (conferma una volta).
4. Alla resa <task_result>: verifica i file toccati prima di dichiarare finito.
