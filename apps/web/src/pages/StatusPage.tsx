import { useEffect, useState } from "react";
import { apiGet, type DoctorDto, type StatusDto } from "../lib/api";
import { useBrain } from "../brain";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow)]">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export default function StatusPage() {
  const [doctor, setDoctor] = useState<DoctorDto | null>(null);
  const [status, setStatus] = useState<StatusDto | null>(null);
  const [err, setErr] = useState("");
  const { refresh } = useBrain();

  const load = () => {
    setErr("");
    Promise.all([
      apiGet<DoctorDto>("/api/doctor"),
      apiGet<StatusDto>("/api/status"),
    ])
      .then(([d, s]) => {
        setDoctor(d);
        setStatus(s);
        refresh();
      })
      .catch((e) => setErr(`backend non raggiungibile: ${String(e).slice(0, 120)}`));
  };
  useEffect(load, []);

  const pct =
    status && status.budget.pct != null
      ? Math.min(100, Math.round(status.budget.pct * 100))
      : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
      <div className="flex items-center">
        <h2 className="text-lg font-semibold">Stato</h2>
        <span className="flex-1" />
        <button
          className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs hover:bg-[var(--panel-2)]"
          onClick={load}
        >
          aggiorna
        </button>
      </div>
      {err && <div className="text-sm text-[var(--ko)]">{err}</div>}
      <Card title="Cervello">
        <div className="text-sm">
          attivo: <b>{doctor?.active ?? status?.brain ?? "…"}</b>
          {" · "}provider: {doctor?.provider ?? "…"}
        </div>
        <div className="mono mt-1 text-xs text-[var(--dim)]">
          api: {doctor ? (doctor.api.ok ? "ok" : doctor.api.detail) : "…"}
          <br />
          local: {doctor ? (doctor.local.ok ? "ok" : doctor.local.detail) : "…"}
        </div>
      </Card>
      <Card title="Budget LLM (oggi)">
        {status ? (
          <>
            <div className="text-sm">
              token: <b>{status.budget.used}</b>
              {status.budget.limit ? ` / ${status.budget.limit}` : " (illimitato)"}
              {" · "}chiamate: {status.budget.calls}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-soft)]">
              <div
                className="h-full bg-[var(--acc)]"
                style={{ width: `${status.budget.pct == null ? 0 : pct}%` }}
              />
            </div>
          </>
        ) : (
          "caricamento…"
        )}
      </Card>
      <Card title="Controlli doctor">
        {(doctor?.checks ?? []).map((c) => (
          <div key={c.id} className="flex items-start gap-2 py-1 text-sm">
            <span
              style={{
                color:
                  c.level === "ok"
                    ? "var(--ok)"
                    : c.level === "warn"
                      ? "var(--warn)"
                      : "var(--ko)",
              }}
            >
              {c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "✗"}
            </span>
            <div>
              <b>{c.label}</b>{" "}
              <span className="text-[var(--dim)]">{c.detail}</span>
              {c.hint && (
                <div className="mono text-xs text-[var(--dim)]">→ {c.hint}</div>
              )}
            </div>
          </div>
        ))}
        {!doctor?.checks && (
          <div className="text-sm text-[var(--dim)]">caricamento…</div>
        )}
      </Card>
      <Card title="Note">
        <div className="text-sm text-[var(--dim)]">
          Servizio: {status?.service ?? "…"} · chiavi e segreti restano env sul
          server, mai mostrati qui.
        </div>
      </Card>
    </div>
  );
}
