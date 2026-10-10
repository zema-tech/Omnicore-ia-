---
name: web-research
description: Ricerca web rapida o approfondita con fonti citate
---

Quando l'utente chiede di cercare, verificare o approfondire qualcosa sul web:
1. Per risposte rapide: web.search con query mirata, maxResults 5.
2. Per approfondimenti ("ricerca a fondo", "report"): research.deep con depth 3, poi leggi il report.
3. Per dettagli da un risultato: web.fetch sull'URL (rispetta anti-SSRF: solo pagine pubbliche).
4. Cita sempre le fonti (titolo + URL), mai inventare fatti oltre i risultati.
