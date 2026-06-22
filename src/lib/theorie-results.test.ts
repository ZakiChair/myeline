import { describe, it, expect } from "vitest";
import { PREUVES, OUVERTURES } from "./theorie-results";

describe("theorie-results : intégrité du tableau de bord", () => {
  it("≥ 6 preuves, champs requis présents, barres dans [0,1]", () => {
    expect(PREUVES.length).toBeGreaterThanOrEqual(6);
    for (const p of PREUVES) {
      expect(p.id).toBeTruthy();
      expect(p.titre).toBeTruthy();
      expect(p.source).toMatch(/\.probe\.test\.ts:\d/);
      expect(p.garanti).toBeTruthy();
      expect(p.observe).toBeTruthy();
      for (const b of p.barres ?? []) {
        expect(b.value).toBeGreaterThanOrEqual(0);
        expect(b.value).toBeLessThanOrEqual(1);
        expect(b.caption).toBeTruthy();
      }
    }
  });
  it("ids de preuve uniques", () => {
    const ids = PREUVES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("≥ 2 ouvertures renseignées", () => {
    expect(OUVERTURES.length).toBeGreaterThanOrEqual(2);
    for (const o of OUVERTURES) {
      expect(o.titre).toBeTruthy();
      expect(o.detail).toBeTruthy();
    }
  });
});
