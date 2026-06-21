import { describe, it, expect } from "vitest";
import { runArm, CREATURE_PARAMS } from "./creature";

// Socle de la créature incarnée : la règle d'apprentissage de contingence, extraite du
// gate prouvé (creature-gate.probe.test.ts) dans un module réutilisable. Même protocole
// 3-bras : APPRIS (reward ssi action correcte) ≫ YOKED (même calendrier, décorrélé) ≈
// ALÉATOIRE (aucun reward). Δ = P(B)−P(C) au rappel cue-seul.

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe("créature incarnée v1 — apprentissage de contingence (socle)", () => {
  it("appris ≫ yoked ≈ aléatoire (Δ = P(B)−P(C)), moyenné sur 16 graines", () => {
    const L: number[] = [];
    const Y: number[] = [];
    const Rn: number[] = [];
    for (const s of SEEDS) {
      // APPRIS : reward ssi l'action choisie est correcte (B = approcher). Calendrier enregistré.
      const learned = runArm(s, (a) => (a === "B" ? 1 : 0));
      // YOKED : MÊME calendrier de reward, mais décorrélé de l'action (exploration décalée).
      const yoked = runArm(s + 1000, (_a, t) => learned.calendar[t]);
      // ALÉATOIRE : aucun reward.
      const random = runArm(s + 2000, () => 0);
      L.push(learned.delta);
      Y.push(yoked.delta);
      Rn.push(random.delta);
    }
    const mL = mean(L);
    const mY = mean(Y);
    const mR = mean(Rn);
    expect(mL).toBeGreaterThanOrEqual(0.7); // l'appris apprend B de façon fiable
    expect(mL).toBeGreaterThan(mY + 0.4); // ≫ yoked (le reward seul ne suffit pas)
    expect(mL).toBeGreaterThan(mR + 0.4); // ≫ aléatoire
  });

  it("garde-fou : params non-négociables (hebbian off, spontaneous 0, φ=0.4)", () => {
    // Si l'un de ces invariants change, la voie sensori-motrice apprise s'effondre
    // (Hebb érode, bruit parasite, seuil incohérent). Test de régression dur.
    expect(CREATURE_PARAMS.hebbian).toBe(false);
    expect(CREATURE_PARAMS.spontaneous).toBe(0);
    expect(CREATURE_PARAMS.fireFraction).toBe(0.4);
  });
});
