# @omnicore/code

**Claude Code di Omnicore** — organo di prima classe, non wrapper di `opencode serve`.

## API

```ts
import { runCodeAgent } from "@omnicore/code";

const result = await runCodeAgent({
  goal: "crea hello.txt con ciao e verifica con cat",
  workspace: process.env.OMNICORE_WORKSPACE,
  budgetSteps: 8,
});
// { ok, summary, steps[], filesTouched[] }
```

## File

| File | Ruolo |
|------|--------|
| `src/workspace.ts` | root jail, read/write/list/shell |
| `src/agent.ts` | loop multi-step plan → act → observe |
| `src/index.ts` | export pubblici |

Path felice = **solo Node built-in**. OpenCode resta boost opzionale nel runtime `omnicore/`.
