export {
  workspaceRoot,
  resolveInRoot,
  readFile,
  writeFile,
  listDir,
  runShell,
  isBlocked,
} from "./workspace.ts";
export type { FsResult } from "./workspace.ts";

export { planCodeSteps, runCodeAgent } from "./agent.ts";
export type {
  CodeStep,
  CodeStepKind,
  CodeAgentInput,
  CodeAgentResult,
} from "./agent.ts";

export { indexSymbols, findDefinition, findReferences } from "./symbols.ts";
export type { SymbolDef, SymbolRef } from "./symbols.ts";

export { lsp } from "./lsp.ts";
export type { LspPosition, LspLocation, LspOpts } from "./lsp.ts";

export { dap } from "./dap.ts";
