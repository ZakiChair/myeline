// Fisher exact — le test de la porte. Vérifié sur des tables aux valeurs publiées.
import { describe, expect, it } from "vitest";
import { fisherExact } from "./stats";

describe("fisherExact", () => {
  it("vaut 1 quand l'effet est inverse à l'hypothèse", () => {
    // Le groupe test répond MOINS que le témoin : P(X ≥ 0) = 1.
    expect(fisherExact(0, 40, 30, 10)).toBe(1);
  });

  it("détecte l'effet publié (80 % vs 10 %) — la porte doit le voir", () => {
    // 32/40 vs 4/40 : p très petit, bien sous 0,01.
    const p = fisherExact(32, 8, 4, 36);
    expect(p).toBeLessThan(0.01);
    expect(p).toBeGreaterThan(0);
  });

  it("ne déclare rien sur des groupes identiques", () => {
    const p = fisherExact(20, 20, 20, 20);
    expect(p).toBeGreaterThan(0.4);
  });

  it("est exact : table à marges fixées, somme hypergéométrique vérifiée à la main", () => {
    // [[8,2],[1,9]] : P(X≥8) = [C(10,8)·C(10,1) + C(10,9)·C(10,0)] / C(20,9) = 460/167960.
    const p = fisherExact(8, 2, 1, 9);
    expect(p).toBeCloseTo(460 / 167960, 10);
  });
});
