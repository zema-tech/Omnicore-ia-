# Security

Postura di Omnicore: single-agent con confini espliciti. Se trovi una falla,
apri una issue privata all'owner prima di divulgarla.

## Cosa è protetto (verificato in `omnicore/tests/`)

- **API fail-closed**: senza `OMNICORE_API_TOKEN`, ogni `/api/*` risponde 401
  (solo `/api/health` resta aperto). Confronto con `hmac.compare_digest`.
- **Conferma umana**: `code.*`, `channel.announce`, `world.exec` non eseguono senza
  `confirm:true`; nel loop serve la frase esplicita dell'utente o `approvo <id>`
  (la conferma del modello viene azzerata — anti prompt-injection).
- **Decide**: le distruttive passano da verify (regole → Jev → CLM), fail-closed.
- **Jail filesystem**: tutto resta sotto `OMNICORE_WORKSPACE`/cwd (`..` negato).
- **Blocklist shell**: `rm -rf /`, `dd …of=/dev/`, shutdown, fork-bomb mai eseguiti.
- **Bind**: `OMNICORE_HOST` non-localhost senza token → il server non parte.

## Cosa NON è protetto

- La dashboard HTML è servita senza auth, ma legge solo via API autenticate.
- Senza `OMNICORE_API_TOKEN` il server serve solo `127.0.0.1` di fatto (API chiuse).
- I segreti non vanno MAI nel repo: solo `.env` locale (ignorato) e `.env.example`.

## Segnalazioni

Non pubblicare exploit nelle issue pubbliche: contatta l'owner in privato,
descrivi impatto e riproduzione, attendi fix prima di divulgare.
