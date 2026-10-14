import { useEffect, useState } from "react";
import { apiGet, type ChannelDto } from "../lib/api";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelDto[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet<ChannelDto[]>("/api/channels")
      .then(setChannels)
      .catch((e) => setErr(String(e).slice(0, 140)));
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h2 className="text-lg font-semibold">Canali</h2>
      <p className="mb-3 text-sm text-[var(--dim)]">
        Backend di <span className="mono">channel.announce</span>: console
        sempre attiva, gli altri si abilitano con il token via env sul server.
        Mai token in questa pagina.
      </p>
      {err && <div className="mb-3 text-sm text-[var(--ko)]">API non raggiungibile ({err}).</div>}
      {channels === null && !err && (
        <div className="text-sm text-[var(--dim)]">caricamento…</div>
      )}
      <div className="flex flex-col gap-2">
        {(channels ?? []).map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-3"
          >
            <span style={{ color: c.ok ? "var(--ok)" : "var(--dim)" }}>
              {c.ok ? "✓" : "○"}
            </span>
            <div>
              <div className="mono text-sm font-semibold">
                {c.id}{" "}
                <span className="text-xs font-normal text-[var(--dim)]">
                  {c.kind}
                </span>
              </div>
              <div className="text-sm text-[var(--dim)]">{c.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
