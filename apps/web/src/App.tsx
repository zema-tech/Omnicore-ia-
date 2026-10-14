import { useEffect, useState } from "react";
import {
  apiGet,
  apiPost,
  streamChat,
  type ChatMessage,
  type SessionInfo,
} from "./api";

type View = "home" | "chat" | "status" | "settings";
type Msg = { role: "user" | "agent"; text: string; live?: boolean };

interface StatusDto {
  service: string;
  brain: string;
  budget: { used: number; calls: number; limit: number; pct: number | null };
}
interface DoctorDto {
  active: string;
  provider: string;
  api: { ok: boolean; detail: string };
  local: { ok: boolean; detail: string };
}

function useTheme() {
  const [dark, setDark] = useState(
    () => localStorage.getItem("omnicore_theme") === "dark",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("omnicore_theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, setDark };
}

function PromptCard(props: {
  onSend: (t: string) => void;
  busy: boolean;
  autofocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [style, setStyle] = useState(
    () => localStorage.getItem("omnicore_style") || "default",
  );
  const send = () => {
    const t = text.trim();
    if (!t || props.busy) return;
    localStorage.setItem("omnicore_style", style);
    setText("");
    props.onSend(t);
  };
  return (
    <div className="promptcard">
      <textarea
        rows={3}
        placeholder="Chiedi a Omnicore…"
        value={text}
        autoFocus={props.autofocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="promptrow">
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          title="Stile risposta"
        >
          <option value="default">Default</option>
          <option value="conciso">Conciso</option>
          <option value="dettagliato">Dettagliato</option>
          <option value="code">Codice</option>
        </select>
        <button
          className="sendbtn"
          onClick={send}
          disabled={props.busy || !text.trim()}
          title="Invia"
        >
          ↑
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { dark, setDark } = useTheme();
  const [view, setView] = useState<View>("home");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sid, setSid] = useState<string | null>(null);
  const [brain, setBrain] = useState("…");
  const [status, setStatus] = useState<StatusDto | null>(null);
  const [doctor, setDoctor] = useState<DoctorDto | null>(null);
  const [token, setToken] = useState(
    () => localStorage.getItem("omnicore_token") || "",
  );
  const [timelineOpen, setTimelineOpen] = useState(true);

  const refreshBrain = async () => {
    try {
      const [d, s] = await Promise.all([
        apiGet<DoctorDto>("/api/doctor"),
        apiGet<StatusDto>("/api/status"),
      ]);
      setBrain(d.active);
      setDoctor(d);
      setStatus(s);
    } catch {
      setBrain("offline");
    }
  };
  useEffect(() => {
    void refreshBrain();
  }, []);

  const saveToken = (t: string) => {
    setToken(t);
    try {
      localStorage.setItem("omnicore_token", t);
    } catch {
      /* best-effort */
    }
  };

  const send = async (text: string) => {
    setView("chat");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text }]);
    setTools([]);
    setMsgs((m) => [...m, { role: "agent", text: "", live: true }]);
    const pushToken = (t: string) =>
      setMsgs((m) => {
        const c = [...m];
        c[c.length - 1] = {
          role: "agent",
          text: c[c.length - 1].text + t,
          live: true,
        };
        return c;
      });
    try {
      let finalReply = "";
      await streamChat(
        text,
        sid,
        {
          onToken: pushToken,
          onTool: (l) => setTools((t) => [...t, l]),
          onSession: (id) => setSid(id),
          onResult: (r) => {
            finalReply = r;
          },
        },
      );
      if (finalReply) {
        setMsgs((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "agent", text: finalReply };
          return c;
        });
      } else {
        setMsgs((m) => {
          const c = [...m];
          c[c.length - 1] = { ...c[c.length - 1], live: false };
          return c;
        });
      }
    } catch (e) {
      setMsgs((m) => {
        const c = [...m];
        c[c.length - 1] = {
          role: "agent",
          text: `Errore di connessione: ${String(e).slice(0, 160)}`,
        };
        return c;
      });
    } finally {
      setBusy(false);
      void refreshBrain();
    }
  };

  return (
    <>
      <header className="topbar">
        <span className="logo">Omnicore</span>
        <span className="brain" title="Stato cervello">
          {brain}
        </span>
        <span className="spacer" />
        <button
          className="iconbtn"
          onClick={() => setDark(!dark)}
          title="Tema chiaro/scuro"
        >
          {dark ? "☾" : "☀"}
        </button>
        <button className="iconbtn" onClick={() => setView("status")}>
          stato
        </button>
        <button className="iconbtn" onClick={() => setView("settings")}>
          ⚙
        </button>
      </header>

      {view === "home" && (
        <main className="landing">
          <h1>Cosa esploriamo?</h1>
          <PromptCard onSend={send} busy={busy} autofocus />
          <span className="hint">
            Chat live sul loop Omnicore · token e tool in diretta
          </span>
        </main>
      )}

      {view === "chat" && (
        <main className="chat">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className={`bubble${m.live ? " live" : ""}`}>{m.text}</div>
            </div>
          ))}
          {tools.length > 0 && (
            <details
              className="timeline"
              open={timelineOpen}
              onToggle={(e) =>
                setTimelineOpen((e.target as HTMLDetailsElement).open)
              }
            >
              <summary>Attività ({tools.length})</summary>
              {tools.join("\n")}
            </details>
          )}
        </main>
      )}

      {view === "status" && (
        <main className="statuspanel">
          <div className="card">
            <h3>Cervello</h3>
            <div>
              attivo: <b>{doctor?.active ?? brain}</b> · provider:{" "}
              {doctor?.provider ?? "…"}
            </div>
            <div className="hint">
              api: {doctor ? (doctor.api.ok ? "ok" : doctor.api.detail) : "…"} ·
              local:{" "}
              {doctor ? (doctor.local.ok ? "ok" : doctor.local.detail) : "…"}
            </div>
          </div>
          <div className="card">
            <h3>Budget</h3>
            {status ? (
              <>
                <div>
                  token oggi: <b>{status.budget.used}</b>
                  {status.budget.limit
                    ? ` / ${status.budget.limit}`
                    : ""}{" "}
                  · chiamate: {status.budget.calls}
                </div>
                <div className="bar">
                  <div
                    style={{
                      width: `${
                        status.budget.pct == null
                          ? 0
                          : Math.min(100, Math.round(status.budget.pct * 100))
                      }%`,
                    }}
                  />
                </div>
              </>
            ) : (
              "caricamento…"
            )}
            <div className="hint">
              Chiavi e segreti restano env sul server, mai mostrati qui.
            </div>
          </div>
          <SessionsPanel sid={sid} />
          <button
            className="iconbtn"
            onClick={() => {
              setView(msgs.length ? "chat" : "home");
            }}
          >
            ← torna alla chat
          </button>
        </main>
      )}

      {view === "settings" && (
        <main className="settings">
          <h3>Impostazioni</h3>
          <label>
            Bearer token
            <input
              type="password"
              value={token}
              autoComplete="off"
              placeholder="OMNICORE_API_TOKEN"
              onChange={(e) => saveToken(e.target.value)}
            />
          </label>
          <span className="hint">
            Salvato solo in localStorage del browser. Mai committato.
          </span>
          <button
            className="iconbtn"
            onClick={() => {
              void refreshBrain();
              setView(msgs.length ? "chat" : "home");
            }}
          >
            salva e torna
          </button>
        </main>
      )}

      {(view === "home" || view === "chat") && msgs.length > 0 && (
        <div className="dock">
          <PromptCard onSend={send} busy={busy} />
        </div>
      )}
    </>
  );
}

function SessionsPanel(props: { sid: string | null }) {
  const [list, setList] = useState<SessionInfo[]>([]);
  const [detail, setDetail] = useState<ChatMessage[] | null>(null);
  useEffect(() => {
    apiGet<SessionInfo[]>("/api/sessions")
      .then(setList)
      .catch(() => setList([]));
  }, []);
  const open = async (id: string) => {
    try {
      const s = await apiGet<{ messages: ChatMessage[] }>(
        `/api/session?id=${encodeURIComponent(id)}`,
      );
      setDetail(s.messages || []);
    } catch {
      setDetail(null);
    }
  };
  const abort = async () => {
    if (!props.sid) return;
    await apiPost("/api/chat/abort", { session_id: props.sid }).catch(
      () => null,
    );
  };
  return (
    <div className="card">
      <h3>Sessioni ({list.length})</h3>
      {list
        .slice(-8)
        .reverse()
        .map((s) => (
          <div key={s.id}>
            <button className="iconbtn" onClick={() => void open(s.id)}>
              {s.id}
            </button>{" "}
            <span className="hint">
              {s.count} msg · {s.last.slice(0, 50)}
              {s.id === props.sid ? " · attiva" : ""}
            </span>
          </div>
        ))}
      {detail && (
        <div className="hint" style={{ whiteSpace: "pre-wrap" }}>
          {detail
            .slice(-5)
            .map((m) => `· [${m.intent || "chat"}] ${(m.answer || "").slice(0, 120)}`)
            .join("\n")}
        </div>
      )}
      {props.sid && (
        <button className="iconbtn" onClick={() => void abort()}>
          interrompi turno
        </button>
      )}
    </div>
  );
}
