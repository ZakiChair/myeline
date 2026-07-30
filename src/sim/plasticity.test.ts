import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { buildTopology } from "./topology";
import { createLif, stepLif } from "./lif";
import { createPlasticity, accumulateEligibility, addDopamine, homeostasis } from "./plasticity";
import { LIF_DEFAUT, PLASTICITE_DEFAUT, TAUX_HOMEO, TOPOLOGIE_DEFAUT } from "./params";

const monter = (n = 2000, seed = 3) => {
  const topo = buildTopology({ ...TOPOLOGIE_DEFAUT, n, seed });
  const lifP = { ...LIF_DEFAUT, noise: 0 };
  const lif = createLif(topo, lifP);
  const ps = createPlasticity(topo, PLASTICITE_DEFAUT);
  return { topo, lif, ps, lifP };
};

/** Premier neurone excitateur ayant au moins une sortie. */
function premierExcitateur(topo: ReturnType<typeof buildTopology>): number {
  for (let i = 0; i < topo.n; i++) {
    if (topo.sign[i] === 1 && topo.outOffsets[i + 1] > topo.outOffsets[i]) return i;
  }
  throw new Error("aucun neurone excitateur avec sortie");
}

function premierInhibiteur(topo: ReturnType<typeof buildTopology>): number {
  for (let i = 0; i < topo.n; i++) {
    if (topo.sign[i] === -1 && topo.outOffsets[i + 1] > topo.outOffsets[i]) return i;
  }
  throw new Error("aucun neurone inhibiteur avec sortie");
}

describe("éligibilité", () => {
  it("reste nulle tant que rien ne décharge", () => {
    const { topo, lif, ps, lifP } = monter();
    for (let k = 0; k < 20; k++) {
      stepLif(topo, lif, lifP, mulberry32(1));
      accumulateEligibility(topo, lif, ps, PLASTICITE_DEFAUT);
    }
    let somme = 0;
    for (let e = 0; e < topo.e; e++) somme += Math.abs(ps.elig[e]);
    expect(somme).toBe(0);
  });

  it("devient positive après une coïncidence pré → post (potentialisation)", () => {
    const { topo, lif, ps, lifP } = monter();
    const src = premierExcitateur(topo);
    const e0 = topo.outOffsets[src];
    const cible = topo.outTarget[e0];

    lif.inject[src] = 10;
    stepLif(topo, lif, lifP, mulberry32(1));
    accumulateEligibility(topo, lif, ps, PLASTICITE_DEFAUT);
    expect(ps.elig[e0]).toBe(0); // la cible n'a pas encore déchargé : rien à créditer

    for (let k = 0; k < 3; k++) {
      lif.inject[cible] = 10;
      stepLif(topo, lif, lifP, mulberry32(1));
      accumulateEligibility(topo, lif, ps, PLASTICITE_DEFAUT);
    }
    expect(ps.elig[e0]).toBeGreaterThan(0);
  });

  it("devient négative dans l'ordre inverse post → pré (dépression)", () => {
    const { topo, lif, ps, lifP } = monter();
    const src = premierExcitateur(topo);
    const e0 = topo.outOffsets[src];
    const cible = topo.outTarget[e0];

    lif.inject[cible] = 10;
    stepLif(topo, lif, lifP, mulberry32(1));
    accumulateEligibility(topo, lif, ps, PLASTICITE_DEFAUT);
    for (let k = 0; k < 3; k++) {
      lif.inject[src] = 10;
      stepLif(topo, lif, lifP, mulberry32(1));
      accumulateEligibility(topo, lif, ps, PLASTICITE_DEFAUT);
    }
    expect(ps.elig[e0]).toBeLessThan(0);
  });

  it("construit une table de décroissance exacte, saturée à zéro au-delà de 4·tauElig", () => {
    const { ps } = monter();
    expect(ps.lut[0]).toBe(1);
    expect(ps.lut[PLASTICITE_DEFAUT.tauElig]).toBeCloseTo(Math.exp(-1), 6);
    expect(ps.lut[2 * PLASTICITE_DEFAUT.tauElig]).toBeCloseTo(Math.exp(-2), 6);
    expect(ps.lut[ps.lut.length - 1]).toBe(0);
    expect(ps.lut.length).toBe(4 * PLASTICITE_DEFAUT.tauElig + 1);
  });

  it("décroît l'éligibilité proportionnellement au temps écoulé", () => {
    const { topo, lif, ps } = monter();
    const src = premierExcitateur(topo);
    const e0 = topo.outOffsets[src];
    ps.elig[e0] = 1;
    ps.lastTouch[e0] = 0;
    lif.t = PLASTICITE_DEFAUT.tauElig;
    // lr = 0 : le déversement ne touche pas w mais applique bien la décroissance paresseuse.
    const vu: number[] = [];
    addDopamine(topo, lif, ps, { ...PLASTICITE_DEFAUT, lr: 0 }, 0, (e, el) => {
      if (e === e0) vu.push(el);
    });
    expect(vu[0]).toBeCloseTo(Math.exp(-1), 5);
  });
});

describe("dopamine", () => {
  it("ne modifie aucun poids sans dopamine, même avec de l'éligibilité accumulée", () => {
    const { topo, lif, ps } = monter();
    const avant = Float32Array.from(topo.w);
    for (let k = 0; k < 100; k++) {
      for (let i = 0; i < lif.n; i += 17) lif.inject[i] = 0.5;
      stepLif(topo, lif, LIF_DEFAUT, mulberry32(k + 1));
      accumulateEligibility(topo, lif, ps, PLASTICITE_DEFAUT);
      addDopamine(topo, lif, ps, PLASTICITE_DEFAUT, 0);
    }
    expect(Array.from(topo.w)).toEqual(Array.from(avant));
  });

  it("renforce sur dopamine positive et affaiblit sur dopamine négative", () => {
    for (const da of [1, -1]) {
      const { topo, lif, ps } = monter();
      const src = premierExcitateur(topo);
      const e = topo.outOffsets[src];
      ps.elig[e] = 0.5;
      ps.lastTouch[e] = lif.t;
      const avant = topo.w[e];
      addDopamine(topo, lif, ps, { ...PLASTICITE_DEFAUT, dumpNow: 0.5 }, da);
      if (da > 0) expect(topo.w[e]).toBeGreaterThan(avant);
      else expect(topo.w[e]).toBeLessThan(avant);
      expect(topo.w[e]).toBeGreaterThanOrEqual(0); // le signe de Dale est préservé
      expect(topo.w[e]).toBeLessThanOrEqual(PLASTICITE_DEFAUT.wMax);
    }
  });

  it("ne descend jamais un poids excitateur sous zéro, même sous forte punition", () => {
    const { topo, lif, ps } = monter();
    const src = premierExcitateur(topo);
    const e = topo.outOffsets[src];
    ps.elig[e] = 50;
    ps.lastTouch[e] = lif.t;
    addDopamine(topo, lif, ps, { ...PLASTICITE_DEFAUT, dumpNow: 0.5 }, -100);
    expect(topo.w[e]).toBe(0);
  });

  it("ne modifie rien quand lr = 0 (témoin gelé)", () => {
    const { topo, lif, ps } = monter();
    const src = premierExcitateur(topo);
    const e = topo.outOffsets[src];
    ps.elig[e] = 0.5;
    ps.lastTouch[e] = lif.t;
    const avant = topo.w[e];
    addDopamine(topo, lif, ps, { ...PLASTICITE_DEFAUT, lr: 0, dumpNow: 0.5 }, 1);
    expect(topo.w[e]).toBe(avant);
  });

  it("laisse les poids inhibiteurs intacts", () => {
    const { topo, lif, ps } = monter();
    const inh = premierInhibiteur(topo);
    const e = topo.outOffsets[inh];
    ps.elig[e] = 0.5;
    ps.lastTouch[e] = lif.t;
    const avant = topo.w[e];
    addDopamine(topo, lif, ps, { ...PLASTICITE_DEFAUT, dumpNow: 0.5 }, 1);
    expect(topo.w[e]).toBe(avant);
  });

  it("déverse à la cadence prévue et borne l'âge des traces excitatrices", () => {
    const { topo, lif, ps } = monter();
    const p = { ...PLASTICITE_DEFAUT, dumpEvery: 4, dumpNow: 99 };
    let deverse = 0;
    for (let k = 1; k <= 12; k++) {
      lif.t = k;
      if (addDopamine(topo, lif, ps, p, 0.01)) deverse++;
    }
    expect(deverse).toBe(3);
    // Le balayage réinitialise lastTouch : l'âge d'une trace ne dépasse jamais la cadence.
    for (let i = 0; i < topo.n; i++) {
      if (topo.sign[i] !== 1) continue;
      for (let e = topo.outOffsets[i]; e < topo.outOffsets[i + 1]; e++) {
        expect(lif.t - ps.lastTouch[e]).toBeLessThanOrEqual(p.dumpEvery);
      }
    }
  });

  it("déverse sans attendre la cadence quand la dopamine dépasse dumpNow", () => {
    const { topo, lif, ps } = monter();
    const p = { ...PLASTICITE_DEFAUT, dumpEvery: 1000, dumpNow: 0.5 };
    lif.t = 1;
    expect(addDopamine(topo, lif, ps, p, 0.2)).toBe(false);
    expect(addDopamine(topo, lif, ps, p, 0.4)).toBe(true); // cumul 0,6 ≥ 0,5
  });
});

describe("homéostasie", () => {
  it("réduit les poids entrants d'un neurone trop actif et augmente ceux d'un neurone trop calme", () => {
    const { topo, lif, ps } = monter();
    const p = PLASTICITE_DEFAUT;
    const sommeEntrante = (j: number) => {
      let s = 0;
      for (let k = topo.inOffsets[j]; k < topo.inOffsets[j + 1]; k++) {
        const e = topo.inEdge[k];
        if (topo.w[e] > 0) s += topo.w[e];
      }
      return s;
    };
    // Deux neurones corticaux voisins, l'un saturé, l'autre muet.
    const actif = 900;
    const calme = 901;
    lif.t = p.homeoEvery;
    lif.spikeTotal[actif] = Math.round(TAUX_HOMEO * p.homeoEvery * 10);
    lif.spikeTotal[calme] = 0;
    const avantActif = sommeEntrante(actif);
    const avantCalme = sommeEntrante(calme);
    homeostasis(topo, lif, ps, p, TAUX_HOMEO);
    expect(sommeEntrante(actif)).toBeLessThan(avantActif);
    expect(sommeEntrante(calme)).toBeGreaterThan(avantCalme);
  });

  it("borne le facteur de mise à l'échelle par passage", () => {
    const { topo, lif, ps } = monter();
    const p = PLASTICITE_DEFAUT;
    const src = premierExcitateur(topo);
    const e = topo.outOffsets[src];
    const j = topo.outTarget[e];
    lif.t = p.homeoEvery;
    lif.spikeTotal[j] = 10_000_000; // absurdement actif
    const avant = topo.w[e];
    homeostasis(topo, lif, ps, p, TAUX_HOMEO);
    // Tolérance relative : les poids sont en Float32, dont la précision (~1e-7 relatif) est
    // plus grossière que l'écart qu'on mesure.
    expect(topo.w[e]).toBeGreaterThanOrEqual(avant * (1 - p.homeoClamp) * (1 - 1e-6));
    expect(topo.w[e]).toBeLessThan(avant);
  });

  it("préserve le compteur cumulé de décharges et mesure sur sa propre fenêtre", () => {
    // spikeTotal sert aussi aux statistiques du lot 3 : l'homéostasie ne doit pas le détruire.
    const { topo, lif, ps } = monter();
    const p = PLASTICITE_DEFAUT;
    lif.t = p.homeoEvery;
    lif.spikeTotal[7] = 42;
    homeostasis(topo, lif, ps, p, TAUX_HOMEO);
    expect(lif.spikeTotal[7]).toBe(42);
    expect(ps.spikeAtLastHomeo[7]).toBe(42);

    // Deuxième passage : seules les décharges de la NOUVELLE fenêtre comptent.
    lif.t = 2 * p.homeoEvery;
    lif.spikeTotal[7] = 50;
    homeostasis(topo, lif, ps, p, TAUX_HOMEO);
    expect(ps.spikeAtLastHomeo[7]).toBe(50);
  });

  it("ne touche pas aux poids inhibiteurs", () => {
    const { topo, lif, ps } = monter();
    const inh = premierInhibiteur(topo);
    const e = topo.outOffsets[inh];
    const avant = topo.w[e];
    lif.t = PLASTICITE_DEFAUT.homeoEvery;
    lif.spikeTotal[topo.outTarget[e]] = 100_000;
    homeostasis(topo, lif, ps, PLASTICITE_DEFAUT, TAUX_HOMEO);
    expect(topo.w[e]).toBe(avant);
  });
});
