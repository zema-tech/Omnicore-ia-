import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  apiGet,
  apiPost,
  streamChat,
  type ChatMessage,
  type SessionInfo,
  type ToolCard,
} from "../lib/api";
import { useBrain } from "../brain";

interface Msg {
  role: "user" | "agent";
  text: string;
  live?: boolean;
}

function ToolChips({ tools }: { tools: ToolCard[] }) {
  if (!tools.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {tools.map((t) => (
        <div
          key={t.id}
          className="mono flex items-center gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs"
        >
          <span
            style={{
              color:
                t.state === "ok"
                  ? "var(--ok)"
                  : t.state === "ko"
                    ? "var(--ko)"
                    : "var(--warn)",
            }}
          >
            {t.state === "ok" ? "✓" : t.state === "ko" ? "✗" : "…"}
          </span>
          <span className="text-[var(--txt)]">{t.name}</span>
          {t.detail && (
            <span className="truncate text-[var(--dim)]">{t.detail}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function SessionList(props: {
  active: string | null;
  onPick: (id: string | null) => void;
  compact?: boolean;
}) {
  const [list, setList] = useState<SessionInfo[]>([]);
  useEffect(() => {
    apiGet<SessionInfo[]>("/api/sessions")
      .then(setList)
      .catch(() => setList([]));
  }, []);
  return (
    <div className="flex flex-col gap-1">
      <button
        className="rounded-[var(--radius)] border border-dashed border-[var(--line)] px-3 py-2 text-left text-sm text-[var(--dim)] hover:text-[var(--txt)]"
        onClick={() => props.onPick(null)}
      >
        + nuova sessione
      </button>
      {[...list].reverse().map((s) => (
        <button
          key={s.id}
          onClick={() => props.onPick(s.id)}
          className={`rounded-[var(--radius)] border px-3 py-2 text-left text-sm ${
            s.id === props.active
              ? "border-[var(--acc)] bg-[var(--acc-dim)]"
              : "border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--panel-2)]"
          }`}
        >
          <div className="mono text-xs text-[var(--dim)]">{s.id}</div>
          <div className="truncate text-[var(--txt)]">
            {s.last.slice(0, 60) || "(vuota)"}
          </div>
          {!props.compact && (
            <div className="text-xs text-[var(--dim)]">{s.count} msg</div>
          )}
        </button>
      ))}
      {!list.length && (
        <div className="text-sm text-[var(--dim)]">nessuna sessione</div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [params, setParams] = useSearchParams();
  const sid = params.get("sid");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [tools, setTools] = useState<ToolCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const { refresh } = useBrain();
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toolId = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, tools]);

  // Carica lo storico quando si sceglie una sessione esistente.
  useEffect(() => {
    if (!sid) {
      setMsgs([]);
      setTools([]);
      return;
    }
    apiGet<{ messages: ChatMessage[] }>(
      `/api/session?id=${encodeURIComponent(sid)}`,
    )
      .then((s) => {
        const m: Msg[] = [];
        for (const x of s.messages || []) {
          m.push({ role: "user", text: x.text });
          if (x.answer) m.push({ role: "agent", text: x.answer });
        }
        setMsgs(m);
        setTools([]);
      })
      .catch(() => setMsgs([]));
  }, [sid]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setTools([]);
    setMsgs((m) => [...m, { role: "agent", text: "", live: true }]);
    const ctl = new AbortController();
    abortRef.current = ctl;
    let finalReply = "";
    try {
      await streamChat(
        t,
        sid,
        {
          onToken: (tok) =>
            setMsgs((m) => {
              const c = [...m];
              c[c.length - 1] = {
                role: "agent",
                text: c[c.length - 1].text + tok,
                live: true,
              };
              return c;
            }),
          onToolStart: (name) => {
            const id = ++toolId.current;
            setTools((x) => [...x, { id, name, state: "run" }]);
          },
          onToolEnd: (name, ok) =>
            setTools((x) => {
              const c = [...x];
              for (let i = c.length - 1; i >= 0; i--) {
                if (c[i].name === name && c[i].state === "run") {
                  c[i] = { ...c[i], state: ok ? "ok" : "ko" };
                  break;
                }
              }
              return c;
            }),
          onLoopEnd: (info) => {
            const id = ++toolId.current;
            setTools((x) => [...x, { id, name: "loop", state: "ok", detail: info }]);
          },
          onSession: (id) => setParams({ sid: id }, { replace: true }),
          onResult: (r) => {
            finalReply = r;
          },
        },
        ctl.signal,
      );
      setMsgs((m) => {
        const c = [...m];
        c[c.length - 1] = { role: "agent", text: finalReply || c[c.length - 1].text };
        return c;
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        setMsgs((m) => {
          const c = [...m];
          c[c.length - 1] = {
            role: "agent",
            text: `${c[c.length - 1].text}\n[interrotto]`,
          };
          return c;
        });
      } else {
        setMsgs((m) => {
          const c = [...m];
          c[c.length - 1] = {
            role: "agent",
            text: `Errore di connessione: ${String(e).slice(0, 160)}`,
          };
          return c;
        });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      refresh();
    }
  };

  const interrupt = async () => {
    abortRef.current?.abort();
    if (sid) {
      await apiPost("/api/chat/abort", { session_id: sid }).catch(() => null);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Pannello sessioni (stile ChatSidebar: lista + nuova) */}
      <div
        className={`${
          showSessions ? "flex" : "hidden"
        } w-64 shrink-0 flex-col gap-2 overflow-y-auto border-r border-[var(--line)] p-3 lg:flex`}
      >
        <div className="text-xs uppercase tracking-wider text-[var(--dim)]">
          Sessioni
        </div>
        <SessionList
          active={sid}
          onPick={(id) => {
            setParams(id ? { sid: id } : {}, { replace: true });
            setShowSessions(false);
          }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
          <button
            className="rounded border border-[var(--line)] px-2 py-1 text-xs text-[var(--dim)] lg:hidden"
            onClick={() => setShowSessions((s) => !s)}
          >
            sessioni
          </button>
          <span className="mono truncate text-xs text-[var(--dim)]">
            {sid ? `sessione ${sid}` : "nuova conversazione — il primo messaggio la crea"}
          </span>
          <span className="flex-1" />
          {busy && (
            <button
              className="rounded border border-[var(--ko)] px-2 py-1 text-xs text-[var(--ko)]"
              onClick={() => void interrupt()}
            >
              ■ interrompi
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {!msgs.length && (
            <div className="m-auto max-w-md text-center">
              <div className="text-xl font-semibold">Cosa esploriamo?</div>
              <p className="text-sm text-[var(--dim)]">
                Chat live sul loop Omnicore. Per azioni su file usa il prefisso{" "}
                <span className="mono">confermo:</span> (es.{" "}
                <span className="mono">confermo: crea note.txt con ciao</span>).
              </p>
            </div>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[var(--radius)] px-3.5 py-2.5 text-[15px] ${
                  m.role === "user"
                    ? "bg-[var(--user)]"
                    : "border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow)]"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {!!tools.length && (
            <div className="max-w-[85%]">
              <ToolChips tools={tools} />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[var(--line)] p-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-2 shadow-[var(--shadow)]">
            <textarea
              rows={2}
              className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent outline-none placeholder:text-[var(--dim)]"
              placeholder="Chiedi a Omnicore… (confermo: per agire sui file)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              className="h-10 w-10 shrink-0 rounded-full bg-[var(--acc)] text-lg text-[var(--bg)] disabled:opacity-35"
              disabled={busy || !text.trim()}
              onClick={() => void send()}
              title="Invia"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
