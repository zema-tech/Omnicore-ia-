// MCP SERVER — Omnicore esposto come server MCP via stdio (stile Hermes
// mcp_serve: client esterni come Claude Desktop/Cursor chiamano i tool).
// Uso: npm run mcp-serve  (poi config Claude Desktop: command node, args […])
// Protocollo: JSON-RPC per righe. initialize / tools/list / tools/call /
// resources/list / resources/read. Le azioni distruttive vogliono
// confirm:true negli arguments (la conferma resta del client chiamante).
// Zero dipendenze. Errori sempre JSON-RPC, mai crash.
import { createInterface } from "node:readline";
import { TOOL_CATALOG, runTool, type ToolCall, type ToolResult } from "./agent/tools.ts";
import { skills } from "./modules/skills.ts";
import { listSessions } from "./modules/sessions.ts";
import { llmDoctor } from "./mind/llm.ts";

const VALID = new Set(TOOL_CATALOG.map((t) => t.name));

function ok(id: unknown, result: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function fail(id: unknown, message: string, code = -32000): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message: String(message).slice(0, 300) } }) + "\n");
}

function toolText(t: ToolResult): { content: { type: string; text: string }[]; isError?: boolean } {
  if (t.ok) {
    const text = typeof t.data === "string" ? t.data : JSON.stringify(t.data ?? null, null, 2);
    return { content: [{ type: "text", text: text.slice(0, 8000) }] };
  }
  if (t.needsConfirm) {
    return { content: [{ type: "text", text: `needsConfirm: ${t.preview ?? t.name} — ripeti con arguments.confirm=true` }], isError: true };
  }
  return { content: [{ type: "text", text: `errore: ${t.error ?? "?"}` }], isError: true };
}

async function handle(msg: any): Promise<void> {
  const id = msg?.id;
  const method = msg?.method;
  const params = msg?.params ?? {};
  if (method === "initialize") {
    ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: "omnicore", version: "0.3" },
    });
    return;
  }
  if (typeof method === "string" && method.startsWith("notifications/")) return; // ack implicito
  if (method === "tools/list") {
    ok(id, {
      tools: TOOL_CATALOG.filter((t) => t.name !== "respond" && t.name !== "abort").map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: { type: "object", additionalProperties: true },
      })),
    });
    return;
  }
  if (method === "tools/call") {
    const name = String(params?.name ?? "");
    if (!VALID.has(name as never) || name === "respond" || name === "abort") {
      fail(id, `tool sconosciuto: ${name}`);
      return;
    }
    const args = params?.arguments && typeof params.arguments === "object" ? params.arguments : {};
    try {
      const r = await runTool({ name: name as ToolCall["name"], args }, { text: "" });
      ok(id, toolText(r));
    } catch (e) {
      fail(id, String(e).slice(0, 200));
    }
    return;
  }
  if (method === "resources/list") {
    ok(id, {
      resources: [
        { uri: "omnicore://sessions", name: "Sessioni", mimeType: "application/json" },
        { uri: "omnicore://skills", name: "Skill", mimeType: "application/json" },
        { uri: "omnicore://doctor", name: "Stato cervello", mimeType: "application/json" },
      ],
    });
    return;
  }
  if (method === "resources/read") {
    const uri = String(params?.uri ?? "");
    try {
      if (uri === "omnicore://sessions") {
        ok(id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(listSessions().slice(-20)) }] });
      } else if (uri === "omnicore://skills") {
        ok(id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(skills.list().map((s) => ({ name: s.name, description: s.description }))) }] });
      } else if (uri === "omnicore://doctor") {
        ok(id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(await llmDoctor()) }] });
      } else {
        fail(id, `risorsa ignota: ${uri}`);
      }
    } catch (e) {
      fail(id, String(e).slice(0, 200));
    }
    return;
  }
  if (id !== undefined) fail(id, `metodo ignoto: ${method}`, -32601);
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    void handle(msg).catch((e) => {
      if (msg?.id !== undefined) fail(msg.id, String(e).slice(0, 200));
    });
  });
  await new Promise<void>((res) => rl.on("close", () => res()));
}

await main();
