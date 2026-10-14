import { useNavigate } from "react-router-dom";
import { SessionList } from "./ChatPage";

export default function SessionsPage() {
  const nav = useNavigate();
  return (
    <div className="mx-auto max-w-2xl p-4">
      <h2 className="mb-1 text-lg font-semibold">Sessioni</h2>
      <p className="mb-3 text-sm text-[var(--dim)]">
        Un solo storico in <span className="mono">data/sessions.json</span>.
        Apri per continuare nella chat.
      </p>
      <SessionList
        active={null}
        onPick={(id) => nav(id ? `/?sid=${encodeURIComponent(id)}` : "/")}
      />
    </div>
  );
}
