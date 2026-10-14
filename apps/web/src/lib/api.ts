// Client API Omnicore — stesso protocollo di omnicore/dashboard.html e server.py:
// POST /api/chat/stream (SSE su POST), POST /api/chat/abort,
// GET /api/sessions, /api/session, /api/status, /api/doctor, /api/skills, /api/channels.

export interface SseEvent {
  event: string;
  [k: string]: unknown;
}

export function baseUrl(): string {
  return (localStorage.getItem("omnicore_base_url") || "").replace(/\/$/, "");
}

function api(path: string): string {
  return `${baseUrl()}${path}`;
}

export function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("omnicore_token") || "";
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(api(path), { headers: authHeaders() });
  if (!r.ok) throw new Error(`http ${r.status}`);
  return r.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(api(path), {
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

export interface StatusDto {
  service: string;
  brain: string;
  budget: { used: number; calls: number; limit: number; pct: number | null };
}

export interface DoctorDto {
  active: string;
  provider: string;
  api: { ok: boolean; detail: string };
  local: { ok: boolean; detail: string };
}

export interface SkillDto {
  name: string;
  description: string;
  path: string;
}

export interface ChannelDto {
  id: string;
  kind: string;
  ok: boolean;
  detail: string;
}

export type ToolState = "run" | "ok" | "ko";

export interface ToolCard {
  id: number;
  name: string;
  state: ToolState;
  detail?: string;
}

/** Stream SSE su POST /api/chat/stream (framing: blocchi \n\n, data:, commenti ": session <id>"). */
export async function streamChat(
  text: string,
  sessionId: string | null,
  cb: {
    onToken?: (t: string) => void;
    onToolStart?: (name: string) => void;
    onToolEnd?: (name: string, ok: boolean) => void;
    onLoopEnd?: (info: string) => void;
    onSession?: (sid: string) => void;
    onResult?: (reply: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  const r = await fetch(api("/api/chat/stream"), {
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
      else if (e.event === "tool_start") cb.onToolStart?.(String(e.name ?? "?"));
      else if (e.event === "tool_end")
        cb.onToolEnd?.(String(e.name ?? "?"), e.ok !== false);
      else if (e.event === "loop_end")
        cb.onLoopEnd?.(
          `giri ${String((e as { rounds?: unknown }).rounds ?? "?")} · ${String((e as { planner?: unknown }).planner ?? "")}`,
        );
    }
  }
}
