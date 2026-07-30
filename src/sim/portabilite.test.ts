import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { createOrganism, runOrganism } from "./organism";
import { ORGANISME_DEFAUT } from "./params";
import { empreinteOrganisme } from "./portabilite";

const cfg = () => ({
  ...ORGANISME_DEFAUT,
  brain: {
    ...ORGANISME_DEFAUT.brain,
    topology: { ...ORGANISME_DEFAUT.brain.topology, n: 2500, seed: 4 },
  },
});

describe("empreinte de l'organisme", () => {
  it("est stable d'une exécution à l'autre sur le même moteur", () => {
    const faire = () => {
      const org = createOrganism(cfg());
      runOrganism(org, 20_000, mulberry32(7));
      return empreinteOrganisme(org);
    };
    expect(faire()).toBe(faire());
  }, 120_000);

  it("détecte un écart d'un seul bit", () => {
    // Une empreinte qui ne bougerait pas sur une perturbation minimale ne prouverait rien de
    // la porte inter-moteurs : ce test vérifie l'INSTRUMENT, pas le modèle.
    const org = createOrganism(cfg());
    runOrganism(org, 200, mulberry32(7));
    const avant = empreinteOrganisme(org);
    org.brain.topo.w[0] = Math.fround(org.brain.topo.w[0] + 1e-7);
    expect(empreinteOrganisme(org)).not.toBe(avant);
  });
});
