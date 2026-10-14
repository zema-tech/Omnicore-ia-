import { useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useBrain } from "./brain";
import { useTheme } from "./theme";
import ChatPage from "./pages/ChatPage";
import SessionsPage from "./pages/SessionsPage";
import StatusPage from "./pages/StatusPage";
import SkillsPage from "./pages/SkillsPage";
import ChannelsPage from "./pages/ChannelsPage";
import SettingsPage from "./pages/SettingsPage";

const NAV = [
  { to: "/", label: "Chat", glyph: "◆", end: true },
  { to: "/sessions", label: "Sessioni", glyph: "▤" },
  { to: "/status", label: "Stato", glyph: "●" },
  { to: "/skills", label: "Skill", glyph: "✦" },
  { to: "/channels", label: "Canali", glyph: "▲" },
  { to: "/settings", label: "Impostazioni", glyph: "⚙" },
];

function brainColor(b: string): string {
  if (b === "api") return "var(--ok)";
  if (b === "local") return "var(--warn)";
  if (b === "offline") return "var(--ko)";
  return "var(--dim)";
}

export default function App() {
  const { brain, budgetPct } = useBrain();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const sidebar = (
    <div className="flex h-full flex-col">
      <button
        className="mb-1 px-3 py-2 text-left text-lg font-bold tracking-wide"
        onClick={() => {
          nav("/");
          setOpen(false);
        }}
      >
        Omnicore
      </button>
      <nav className="flex flex-col gap-1 px-2">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-sm no-underline ${
                isActive
                  ? "bg-[var(--acc-dim)] text-[var(--txt)]"
                  : "text-[var(--dim)] hover:bg-[var(--bg-soft)] hover:text-[var(--txt)]"
              }`
            }
            style={{ textDecoration: "none" }}
          >
            <span className="w-5 text-center text-[var(--acc)]">{n.glyph}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto px-3 py-3 text-xs text-[var(--dim)]">
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-soft)] p-2">
          loop ReAct · jail workspace
          <br />
          conferme per scritture
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full bg-[var(--bg)] text-[var(--txt)]">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 border-r border-[var(--line)] bg-[var(--bg-soft)] py-3 md:block">
        {sidebar}
      </aside>
      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-[var(--bg-soft)] py-3 shadow-[var(--shadow)]">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
          <button
            className="rounded px-2 py-1 text-[var(--dim)] hover:bg-[var(--bg-soft)] md:hidden"
            onClick={() => setOpen(true)}
            title="Menu"
          >
            ☰
          </button>
          <span className="text-sm font-semibold md:hidden">Omnicore</span>
          <span className="flex-1" />
          <span
            className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-2.5 py-0.5 text-xs"
            title="Cervello attivo"
          >
            <span style={{ color: brainColor(brain) }}>●</span> {brain}
          </span>
          <span
            className="hidden rounded-full border border-[var(--line)] bg-[var(--panel)] px-2.5 py-0.5 text-xs text-[var(--dim)] sm:inline"
            title="Budget token giornaliero"
          >
            budget {budgetPct == null ? "∞" : `${Math.round(budgetPct * 100)}%`}
          </span>
          <button
            className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-2.5 py-0.5 text-xs hover:bg-[var(--panel-2)]"
            onClick={toggle}
            title="Tema chiaro/scuro"
          >
            {theme === "dark" ? "☾ scuro" : "☀ chiaro"}
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>

        <footer className="border-t border-[var(--line)] px-3 py-1.5 text-xs text-[var(--dim)]">
          Omnicore · memoria + codice + presenza · chiavi solo env sul server
        </footer>
      </div>
    </div>
  );
}
