// Test skill precaricate: tutte parsabili, con nome+descrizione+istruzioni vere.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listSkills, getSkill, searchSkills } from "../src/modules/skills.ts";

const EXPECTED = ["nota-breve", "riepilogo-sessione", "web-research", "code-review", "git-workflow", "testing", "sys-monitor", "deep-notes"];

describe("skill precaricate", () => {
  it("tutte presenti e valide", () => {
    const all = listSkills();
    const names = all.map((s) => s.name);
    for (const n of EXPECTED) assert.ok(names.includes(n), `manca: ${n}`);
    for (const s of all) {
      assert.ok(s.description.length > 10, `${s.name}: description corta`);
      assert.ok(s.instructions.length >= 100, `${s.name}: istruzioni esili`);
    }
  });
  it("catalogo ampio: almeno 30 pack validi", () => {
    const all = listSkills();
    assert.ok(all.length >= 30, `pack: ${all.length}`);
  });
  it("web-research trovabile e cita tool veri", () => {
    const s = getSkill("web-research")!;
    assert.ok(s.instructions.includes("web.search"));
    assert.ok(searchSkills("revisione codice").some((x) => x.name === "code-review"));
  });
  it("curator non boccia i pack (niente thin/empty)", async () => {
    const { skills } = await import("../src/modules/skills.ts");
    const r = skills.audit();
    for (const i of r.issues) {
      assert.ok(!(i.kind === "thin" && EXPECTED.includes(i.skill)), `thin: ${i.skill}`);
      assert.ok(!(i.kind === "empty-desc" && EXPECTED.includes(i.skill)), `empty: ${i.skill}`);
    }
  });
});
