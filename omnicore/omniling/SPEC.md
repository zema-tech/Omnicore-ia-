# OmniLang v0.1 — glue language per collegare sistemi all'IA

Sintassi stile **Python** (indentazione 2 spazi, `#` commenti),
annotazioni opzionali stile **TypeScript** (tipi dopo `:` dove servono).
Unico scopo: dichiarare **sistemi → tool → flow** così l'IA li usa senza
scrivere codice imperativo. Implementazioni identiche in `py/` e `ts/`:
stesso sorgente `.omni` produce lo stesso AST JSON in entrambi.

## Esempio completo

```omni
# sistemi: nome, kind (memory|hands|face|custom), dove raggiungerli
system hermes: memory via "bridge"
system opencode: hands via "http://127.0.0.1:4096"
system openclaw: face via "http://127.0.0.1:18789"

# tool: un'azione su un sistema. call = metodo reale del sistema.
tool recall on hermes:
  call "conversations_list"
  args search = $query, limit = 5

tool build on opencode:
  call "session/prompt"
  args prompt = $text

tool ping on openclaw:
  call "status"

# flow: sequenza di step. when/if = guardie sull'intent o sulle variabili.
flow "accoglienza" when intent == "chat":
  ctx = recall(search: $text)
  out = ping()

flow "fix" when intent == "code":
  ctx = recall(search: $text)
  if ctx:
    patch = build(prompt: $text)
```

## Grammatica (v0.1)

```
program   := stmt*
stmt      := system | tool | flow
system    := "system" NAME ":" KIND "via" STRING
tool      := "tool" NAME "on" NAME ":" NEWLINE (call | args)+
call      := "call" STRING
args      := "args" named (, named)*
flow      := "flow" [STRING] ["when" expr] ":" NEWLINE step+
step      := assign | ifblock
assign    := VAR "=" (callref | value)
callref   := NAME "(" [named (, named)*] ")"
ifblock   := "if" expr ":" NEWLINE step+
expr      := operand [("==" | "!=") operand]
operand   := "$"VAR | NAME | STRING | NUMBER | "true" | "false"
value     := "$"VAR | STRING | NUMBER | "true" | "false"
named     := NAME (":" | "=") value
```

Regole: indentazione 2 spazi/livello (tab vietati), righe vuote e `#`
ignorati, `NAME = [A-Za-z_][A-Za-z0-9_]*`, un `call` per tool, `args` = default
sovrascrivibili dai named del `callref`. Il contesto iniziale di un flow è
`{text, intent}` (+ `intent` dal router Omnicore); `$x` risolve le variabili.

## Dispatch executor (come `call` diventa azione reale)

| kind | call | effetto |
|---|---|---|
| memory | qualsiasi tool Hermes (`conversations_list`, `messages_read`, …) | adapter Hermes |
| hands | `session/prompt` | `opencode serve`, fallback `opencode run` CLI |
| face | `status`, `commands.list`, `cron.list`, `agents.list`, `channels.status` | rpc OpenClaw |
| face | `announce` | `cron.add` one-shot best-effort |
| * | altro | errore nel risultato dello step, mai crash |

Tipi dopo `:` in `system` (es. `system x: memory`) sono vincoli di kind;
nelle future versioni anche `tool nome(param: tipo):` — in v0.1 i tipi
restano documentativi dove non servono al dispatch.
