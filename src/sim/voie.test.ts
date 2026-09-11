// Tests de la voie olfactive — lot 1 de la refonte.
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../lib/rng";
import {
  LIF_DEFAUT,
  PLASTICITE_DEFAUT,
  VOIE_DEFAUT,
} from "./params";
import {
  buildVoie,
  createVoie,
  dechargesKC,
  dechargesSortie,
  injecterGust,
  injecterOdeur,
  stepVoie,
} from "./voie";
import { actifs, declinerN, distanceOdeur, genererOdeur } from "./tasks/odors";

const cfg = (over = {}) => ({ ...VOIE_DEFAUT, n: 1_200, ...over });

describe("topologie de la voie", () => {
  it("est déterministe pour une même graine", () => {
    const a = buildVoie(cfg());
    const b = buildVoie(cfg());
    expect(a.topo.w).toEqual(b.topo.w);
    expect(a.topo.outTarget).toEqual(b.topo.outTarget);
    expect(a.plastSet).toEqual(b.plastSet);
  });

  it("CSR bidirectionnel cohérent", () => {
    const { topo } = buildVoie(cfg());
    expect(topo.outOffsets[topo.n]).toBe(topo.e);
    expect(topo.inOffsets[topo.n]).toBe(topo.e);
    for (let e = 0; e < topo.e; e++) {
      const j = topo.outTarget[e];
      // l'arête se retrouve dans les entrées de sa cible
      let vu = false;
      for (let q = topo.inOffsets[j]; q < topo.inOffsets[j + 1]; q++) {
        if (topo.inEdge[q] === e) vu = true;
      }
      expect(vu).toBe(true);
    }
  });

  it("confine la plasticité aux arêtes KC → sorties (MBON et SER)", () => {
    const { topo, bornes, plastSet, plastChannel } = buildVoie(cfg());
    for (const e of plastSet) {
      const cible = topo.outTarget[e];
      const dansMbon =
        cible >= bornes.mbon.start && cible < bornes.mbon.start + bornes.mbon.count;
      const dansSer =
        cible >= bornes.ser.start && cible < bornes.ser.start + bornes.ser.count;
      expect(dansMbon || dansSer).toBe(true);
      // Chaque couche de sortie a son canal : MBON = appétitif (OA, canal 0 par
      // défaut), SER = aversif (DA, canal 2).
      expect(plastChannel[e]).toBe(dansSer ? 2 : 0);
    }
  });

  it("la loi de Dale tient : seul l'APL est inhibiteur", () => {
    const { topo, bornes } = buildVoie(cfg());
    for (let i = 0; i < topo.n; i++) {
      const attendu = i === bornes.apl.start ? -1 : 1;
      expect(topo.sign[i]).toBe(attendu);
    }
  });

  it("jette si la boucle APL dépasse la borne d'oscillation mesurée", () => {
    expect(() => buildVoie(cfg({ gainAPL: 51 }))).toThrow(/gainAPL/);
  });
});

describe("dynamique", () => {
  it("l'APL borne le taux des cellules de Kenyon (pas de récurrence, pas d'homéostasie)", () => {
    const v = createVoie(cfg(), LIF_DEFAUT, PLASTICITE_DEFAUT);
    const rng = mulberry32(3);
    const odeur = genererOdeur(mulberry32(9), v.params.nGlom, "A");
    // 6 000 ticks sous odeur continue : le taux doit rester borné et non nul.
    const fenetres = 3;
    const taux: number[] = [];
    for (let f = 0; f < fenetres; f++) {
      let c = 0;
      for (let t = 0; t < 2000; t++) {
        injecterOdeur(v, odeur.intensites, 1.2);
        stepVoie(v, rng, 0);
        c += dechargesKC(v);
      }
      taux.push(c / (2000 * v.bornes.kc.count));
    }
    for (const taux_ of taux) {
      expect(taux_).toBeGreaterThan(0.001);
      expect(taux_).toBeLessThan(0.4);
    }
  });

  it("le réflexe inconditionnel est câblé : le sucrose fait répondre la sortie", () => {
    const v = createVoie(cfg(), LIF_DEFAUT, PLASTICITE_DEFAUT);
    const rng = mulberry32(5);
    let sousUS = 0;
    for (let t = 0; t < 3000; t++) {
      injecterGust(v, 1.5);
      stepVoie(v, rng, 0);
      sousUS += dechargesSortie(v);
    }
    expect(sousUS).toBeGreaterThan(0);
  });

  it("sans dopamine, aucun poids ne bouge — même plastique", () => {
    const v = createVoie(cfg(), LIF_DEFAUT, PLASTICITE_DEFAUT);
    const rng = mulberry32(7);
    const odeur = genererOdeur(mulberry32(2), v.params.nGlom, "A");
    const w0 = v.topo.w.slice();
    for (let t = 0; t < 4000; t++) {
      injecterOdeur(v, odeur.intensites, 1.2);
      stepVoie(v, rng, 0); // jamais de dopamine
    }
    expect(v.topo.w).toEqual(w0);
  });

  it("la plasticité confinée ne touche QUE les arêtes du plastSet", () => {
    const v = createVoie(cfg(), LIF_DEFAUT, PLASTICITE_DEFAUT);
    const rng = mulberry32(11);
    const odeur = genererOdeur(mulberry32(4), v.params.nGlom, "A");
    const w0 = v.topo.w.slice();
    const flag = new Uint8Array(v.topo.e);
    for (const e of v.plastSet) flag[e] = 1;
    // Odeur + US simultanés : dopamine forte pour forcer le mouvement.
    for (let t = 0; t < 6000; t++) {
      injecterOdeur(v, odeur.intensites, 1.2);
      injecterGust(v, 1.5);
      stepVoie(v, rng, t >= 2000 && t < 5000 ? 0.05 : 0);
    }
    let deplaceesHorsSet = 0;
    for (let e = 0; e < v.topo.e; e++) {
      if (flag[e] === 0 && v.topo.w[e] !== w0[e]) deplaceesHorsSet++;
    }
    expect(deplaceesHorsSet).toBe(0);
  });
});

describe("espace d'odeurs — déclinaisons (rang 2)", () => {
  it("declinerN remplace exactement n glomérules actifs", () => {
    const rng = mulberry32(21);
    const A = genererOdeur(rng, 160, "A");
    const nA = actifs(A).length;
    const B = declinerN(rng, A, 10, "B");
    expect(actifs(B).length).toBe(nA);
    // La distance mesurée = fraction des actifs de A absents de B.
    expect(distanceOdeur(A, B)).toBeCloseTo(10 / nA, 5);
    const C = declinerN(rng, A, nA, "C");
    expect(distanceOdeur(A, C)).toBe(1); // disjointe
    const D = declinerN(rng, A, 0, "D");
    expect(distanceOdeur(A, D)).toBe(0);
  });
});

describe("confinement — accumulateEligibility", () => {
  it("n'accumule aucune éligibilité hors du plastSet", () => {
    const v = createVoie(cfg(), LIF_DEFAUT, PLASTICITE_DEFAUT);
    const rng = mulberry32(13);
    const odeur = genererOdeur(mulberry32(6), v.params.nGlom, "A");
    const flag = new Uint8Array(v.topo.e);
    for (const e of v.plastSet) flag[e] = 1;
    // Forte co-activité : odeur + sucrose — tout ce qui peut être marqué l'est.
    for (let t = 0; t < 3000; t++) {
      injecterOdeur(v, odeur.intensites, 1.2);
      injecterGust(v, 1.5);
      stepVoie(v, rng, 0);
    }
    let eligHorsSet = 0;
    for (let e = 0; e < v.topo.e; e++) {
      if (flag[e] === 0 && v.plast.elig[e] !== 0) eligHorsSet++;
    }
    expect(eligHorsSet).toBe(0);
  });
});
