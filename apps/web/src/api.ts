// Client API Omnicore — riusa il protocollo di omnicore/dashboard.html.
// POST /api/chat/stream (SSE su POST), GET /api/status, GET /api/doctor,
// GET /api/sessions, GET /api/session?id=, POST /api/chat/abort.

export interface SseEvent {
  event: string;
  [k: string]: unknown;
}

export function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("omnicore_token") || "";
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: authHeaders() });
  if (!r.ok) throw new Error(`http ${r.status}`);
  return r.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`http ${r.status}`);
  return r.json() as Promise<T>;
}

export interface SessionInfo {
  id: string;
  created: number;
  count: number;
  last: string;
}

export interface ChatMessage {
  text: string;
  intent?: string;
  ok?: boolean;
  answer?: string;
  summary?: string;
}

/** Stream SSE su POST /api/chat/stream. Stesso framing di dashboard.html:
 *  blocchi separati da \n\n, righe "data: {...}", commenti ": session <id>". */
export async function streamChat(
  text: string,
  sessionId: string | null,
  cb: {
    onToken?: (t: string) => void;
    onTool?: (line: string) => void;
    onSession?: (sid: string) => void;
    onResult?: (reply: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  const r = await fetch("/api/chat/stream", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ text, session_id: sessionId }),
    signal,
  });
  if (!r.ok || !r.body) throw new Error(`stream http ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const line = p.trim();
      if (line.startsWith(":")) {
        const m = line.match(/^:\s*session\s+(\S+)/);
        if (m?.[1]) cb.onSession?.(m[1]);
        continue;
      }
      if (!line.startsWith("data:")) continue;
      let e: SseEvent;
      try {
        e = JSON.parse(line.slice(5).trim()) as SseEvent;
      } catch {
        continue;
      }
      if (e.event === "token") cb.onToken?.(String(e.text ?? ""));
      else if (e.event === "result") cb.onResult?.(String(e.reply ?? ""));
      else if (e.event === "tool_start") cb.onTool?.(`… ${String(e.name ?? "?")} …`);
      else if (e.event === "tool_end")
        cb.onTool?.(`… ${String(e.name ?? "?")} ${e.ok ? "ok" : "KO"}`);
      else if (e.event === "loop_end")
        cb.onTool?.(
          `[giri ${String((e as { rounds?: unknown }).rounds ?? "?")}]`,
        );
    }
  }
}
