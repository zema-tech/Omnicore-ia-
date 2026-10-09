# @omnicore/code — Claude Code di Omnicore

Organo coding di **prima classe** (stile Claude Code / Codex), non wrapper di OpenCode.

Ispirazione prodotto (non codice copiato):
- [Rakazo](https://github.com/elie222/rakazo) — step visibili, computer/workspace, BYOK
- [invisible_dots](https://github.com/feder-cr/invisible_dots) — skill su disco, permessi ask/allow, timeline task

## Runtime collegato

Nel loop agente Omnicore:

```text
code.task { goal }  →  modules/code_agent.ts  →  packages/code runCodeAgent
```

Ritorna:

```json
{
  "summary": "…",
  "timeline": "1. ✓ write hello.txt — …",
  "steps": [{ "kind": "write", "path": "hello.txt", "ok": true }],
  "filesTouched": ["hello.txt"]
}
```

Serve **conferma** utente (`confermo: …`) come le altre azioni che scrivono.

## API diretta

```ts
import { runCodeAgent } from "./src/index.ts";

const r = await runCodeAgent({
  goal: "crea note.md con hello e verifica",
  workspace: "/tmp/omni-ws",
  budgetSteps: 6,
});
```

Path felice = solo Node built-in (jail su `OMNICORE_WORKSPACE`).
OpenCode resta boost opzionale in `omnicore/src/faculties/code.ts`.
