import { useEffect, useState } from "react";
import { apiGet, type SkillDto } from "../lib/api";

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillDto[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet<SkillDto[]>("/api/skills")
      .then(setSkills)
      .catch((e) => setErr(String(e).slice(0, 140)));
  }, []);

  const list = (skills ?? []).filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.description.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h2 className="text-lg font-semibold">Skill</h2>
      <p className="mb-3 text-sm text-[var(--dim)]">
        Pack riusabili da <span className="mono">omnicore/skills/</span> (52
        pack: onboarding, review, incidenti, migrazioni, costi, modelli…).
        {skills !== null && ` ${skills.length} caricati.`}
      </p>
      <input
        className="mb-3 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none placeholder:text-[var(--dim)]"
        placeholder="filtra skill…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {err && (
        <div className="mb-3 text-sm text-[var(--ko)]">
          API non raggiungibile ({err}). Le skill vivono comunque in{" "}
          <span className="mono">omnicore/skills/&lt;nome&gt;/SKILL.md</span>.
        </div>
      )}
      {skills === null && !err && (
        <div className="text-sm text-[var(--dim)]">caricamento…</div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((s) => (
          <div
            key={s.name}
            className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-3"
          >
            <div className="mono text-sm font-semibold text-[var(--acc)]">
              {s.name}
            </div>
            <div className="text-sm text-[var(--dim)]">
              {s.description || "(senza descrizione)"}
            </div>
          </div>
        ))}
      </div>
      {skills !== null && !list.length && (
        <div className="text-sm text-[var(--dim)]">nessuna skill trovata.</div>
      )}
    </div>
  );
}
