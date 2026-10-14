import { useState } from "react";

export default function SettingsPage() {
  const [token, setToken] = useState(
    () => localStorage.getItem("omnicore_token") || "",
  );
  const [base, setBase] = useState(
    () => localStorage.getItem("omnicore_base_url") || "",
  );
  const [saved, setSaved] = useState(false);

  const save = () => {
    try {
      localStorage.setItem("omnicore_token", token);
      localStorage.setItem("omnicore_base_url", base.replace(/\/$/, ""));
    } catch {
      /* best-effort */
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4">
      <h2 className="text-lg font-semibold">Impostazioni</h2>
      <label className="flex flex-col gap-1 text-sm">
        Bearer token
        <input
          type="password"
          autoComplete="off"
          placeholder="OMNICORE_API_TOKEN"
          className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 outline-none placeholder:text-[var(--dim)]"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <span className="text-xs text-[var(--dim)]">
          Solo localStorage del browser. Mai committato, mai mostrato altrove.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Base URL backend (opzionale)
        <input
          type="text"
          autoComplete="off"
          placeholder="(stessa origine, via proxy dev)"
          className="mono rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none placeholder:text-[var(--dim)]"
          value={base}
          onChange={(e) => setBase(e.target.value)}
        />
        <span className="text-xs text-[var(--dim)]">
          Vuoto = stessa origine (consigliato: dev con proxy Vite,
          produzione servita da server.py).
        </span>
      </label>
      <button
        className="w-fit rounded-full bg-[var(--acc)] px-5 py-2 text-sm font-semibold text-[var(--bg)]"
        onClick={save}
      >
        {saved ? "salvato ✓" : "salva"}
      </button>
    </div>
  );
}
