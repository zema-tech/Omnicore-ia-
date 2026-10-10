---
name: backup-guide
description: Guida backup di dati, vault e memorie
---

Quando l'utente chiede backup o teme di perdere dati:
1. Elenca cosa conta: data/vault (note), data/*.sqlite (memorie), data/*.json (stato), skills/ (versionate).
2. Proponi comandi code.shell mirati (tar/cp) con conferma, mai rm -rf (bloccato).
3. Verifica: rileggi l'archivio creato (code.read/list) prima di dichiarare ok.
4. Ricorda: skills/ è in git, il resto no — il backup copre data/.
