// Tests du harnais : la plomberie des essais, pas l'apprentissage (la porte est la
// sonde). Fenêtres justes, ITI calculé depuis tauElig, témoins bien distincts.
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../lib/rng";
import { LIF_DEFAUT, PLASTICITE_DEFAUT, VOIE_DEFAUT } from "../params";
import { calibrerSeuil, runEssai, PER_DEFAUT } from "./per";
import {
  calendrier,
  ENVELOPPE_DEFAUT,
  essaiApparie,
  itiTicks,
} from "./schedules";
import { genererOdeur } from "./odors";
import { createVoie } from "../voie";

const cfg = () => ({ ...VOIE_DEFAUT, n: 1_200, gainAPL: 20, w0: 0.003 });

describe("enveloppes", () => {
  it("l'apparié pose l'US à l'ISI dans le CS — notation AVANT l'US", () => {
    const odeur = genererOdeur(mulberry32(1), 40, "A");
    const plan = essaiApparie(ENVELOPPE_DEFAUT, odeur, 12_000);
    expect(plan.cs!.debut).toBe(ENVELOPPE_DEFAUT.miseEnPlace);
    expect(plan.us!.debut).toBe(plan.cs!.debut + ENVELOPPE_DEFAUT.isi);
    // Le chevauchement publié : l'US commence 1 s avant la fin du CS.
    expect(plan.cs!.fin - plan.us!.debut).toBe(1_000);
    // Noté pendant le CS mais avant l'US : une réponse est conditionnée.
    expect(plan.notation!.fin).toBeLessThanOrEqual(plan.us!.debut);
    expect(plan.notation!.debut).toBe(plan.cs!.debut);
  });

  it("l'ITI est calculé depuis tauElig, jamais écrit en dur", () => {
    expect(itiTicks(2_500, 2_000)).toBe(12_000);
    // À dt = 10 ms, tauElig = 250 : l'ITI suit la constante, pas un littéral.
    expect(itiTicks(250, 200)).toBe(1_200);
  });

  it("le non apparié ne fait JAMAIS co-occurence CS/US", () => {
    const odeur = genererOdeur(mulberry32(2), 40, "A");
    const plans = calendrier("nonApparie", 5, odeur, ENVELOPPE_DEFAUT, 12_000, 7);
    expect(plans).toHaveLength(10); // 5 CS seuls + 5 US seuls
    for (const p of plans) {
      expect(p.cs === null || p.us === null).toBe(true);
    }
    expect(plans.filter((p) => p.notation !== null)).toHaveLength(5);
  });

  it("l'inversé pose l'US AVANT le CS", () => {
    const odeur = genererOdeur(mulberry32(3), 40, "A");
    const plans = calendrier("inverse", 5, odeur, ENVELOPPE_DEFAUT, 12_000, 7);
    expect(plans).toHaveLength(5);
    for (const p of plans) expect(p.us!.fin).toBeLessThanOrEqual(p.cs!.debut);
  });
});

describe("harnais", () => {
  it("un essai s'exécute et rend un compte entier", () => {
    const v = createVoie(cfg(), LIF_DEFAUT, PLASTICITE_DEFAUT);
    const rng = mulberry32(11);
    const odeur = genererOdeur(mulberry32(5), v.params.nGlom, "A");
    const plan = essaiApparie(ENVELOPPE_DEFAUT, odeur, 12_000);
    const r = runEssai(v, plan, PER_DEFAUT, 100, rng);
    expect(Number.isInteger(r.compte)).toBe(true);
    expect(v.lif.t).toBe(plan.duree);
  });

  it("la calibration déduit un seuil du taux spontané cible", () => {
    const v = createVoie(cfg(), LIF_DEFAUT, PLASTICITE_DEFAUT);
    const rng = mulberry32(13);
    const odeur = genererOdeur(mulberry32(8), v.params.nGlom, "A");
    const { seuil, comptages } = calibrerSeuil(
      v,
      odeur,
      PER_DEFAUT,
      PLASTICITE_DEFAUT,
      8,
      0.05,
      rng,
    );
    expect(seuil).toBeGreaterThan(0);
    expect(comptages.length).toBe(8);
  });
});
