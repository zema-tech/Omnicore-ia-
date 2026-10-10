---
name: git-workflow
description: Stato, diff e commit git guidati e sicuri
---

Quando l'utente chiede operazioni git:
1. Leggi prima: code.shell "git status --short" e "git diff --stat" (conferma già data se l'utente ha scritto confermo:).
2. Commit solo su richiesta esplicita ("committa", "pusha"): verifica diff reale, un commit per tappa, mai --force né --amend su push altrui.
3. Mai committare segreti (.env, chiavi): controlla git status prima di add.
4. Push: se rifiutato per divergenza, fetch + rebase, mai force-push senza ok.
