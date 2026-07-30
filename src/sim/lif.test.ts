import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { buildTopology } from "./topology";
import { createLif, stepLif, meanRate } from "./lif";
import { LIF_DEFAUT, TOPOLOGIE_DEFAUT } from "./params";

const topo = () => buildTopology({ ...TOPOLOGIE_DEFAUT, n: 2000, seed: 3 });
const lifP = (over = {}) => ({ ...LIF_DEFAUT, noise: 0, ...over });

describe("stepLif", () => {
  it("ne fait décharger personne sans entrée ni bruit", () => {
    const t = topo();
    const st = createLif(t, lifP());
    for (let k = 0; k < 50; k++) expect(stepLif(t, st, lifP(), mulberry32(1))).toBe(0);
  });

  it("décharge quand le courant injecté franchit le seuil, puis reste réfractaire", () => {
    const t = topo();
    const p = lifP({ refrac: 4 });
    const st = createLif(t, p);
    st.inject[0] = 10;
    expect(stepLif(t, st, p, mulberry32(1))).toBeGreaterThanOrEqual(1);
    expect(st.fired[0]).toBe(1);
    expect(st.refracLeft[0]).toBe(4);
    for (let k = 0; k < 4; k++) {
      st.inject[0] = 10;
      stepLif(t, st, p, mulberry32(1));
      expect(st.fired[0]).toBe(0);
    }
  });

  it("consomme l'injection : elle ne vaut que pour un tick", () => {
    const t = topo();
    const p = lifP();
    const st = createLif(t, p);
    st.inject[5] = 3;
    stepLif(t, st, p, mulberry32(1));
    expect(st.inject[5]).toBe(0);
  });

  it("élève le seuil après une décharge puis le laisse redescendre vers thrBase", () => {
    const t = topo();
    const p = lifP({ tauThr: 20 });
    const st = createLif(t, p);
    st.inject[0] = 10;
    stepLif(t, st, p, mulberry32(1));
    const apres = st.thr[0];
    expect(apres).toBeGreaterThan(p.thrBase);
    for (let k = 0; k < 200; k++) stepLif(t, st, p, mulberry32(1));
    expect(st.thr[0]).toBeLessThan(apres);
    expect(st.thr[0]).toBeCloseTo(p.thrBase, 2);
  });

  it("respecte le délai axonal : aucune cible ne reçoit avant le délai minimal de la source", () => {
    const t = topo();
    const p = lifP();
    const st = createLif(t, p);
    const src = 0;
    let dMin = 255;
    for (let e = t.outOffsets[src]; e < t.outOffsets[src + 1]; e++) {
      dMin = Math.min(dMin, t.outDelay[e]);
    }
    expect(dMin).toBeGreaterThanOrEqual(1);
    st.inject[src] = 10;
    stepLif(t, st, p, mulberry32(1)); // décharge au tick 0

    // On somme hors de la source : son propre iSyn porte encore l'injection, qui n'a rien
    // à voir avec la propagation synaptique.
    const recuAilleurs = () => {
      let s = 0;
      for (let i = 0; i < st.n; i++) if (i !== src) s += Math.abs(st.iSyn[i]);
      return s;
    };
    for (let k = 1; k < dMin; k++) {
      stepLif(t, st, p, mulberry32(1));
      expect(recuAilleurs()).toBe(0);
    }
    stepLif(t, st, p, mulberry32(1)); // tick dMin : la première livraison arrive
    expect(recuAilleurs()).toBeGreaterThan(0);
  });

  it("ne fait jamais décharger un neurone masqué (lésion)", () => {
    const t = topo();
    const p = lifP();
    const st = createLif(t, p);
    st.silenced = new Uint8Array(st.n);
    st.silenced[0] = 1;
    for (let k = 0; k < 20; k++) {
      st.inject[0] = 10;
      stepLif(t, st, p, mulberry32(1));
      expect(st.fired[0]).toBe(0);
    }
    expect(st.spikeTotal[0]).toBe(0);
  });

  it("garde le même flux de bruit qu'un neurone soit masqué ou non", () => {
    // Sans cette propriété, le protocole de lésion du lot 3 ne pourrait pas comparer une
    // lésion ciblée à une lésion aléatoire sous le même bruit.
    const t = topo();
    const p = lifP({ noise: 0.05 });
    const trace = (masque: boolean) => {
      const st = createLif(t, p);
      if (masque) {
        st.silenced = new Uint8Array(st.n);
        st.silenced[7] = 1;
      }
      const rng = mulberry32(11);
      const out: number[] = [];
      for (let k = 0; k < 30; k++) {
        stepLif(t, st, p, rng);
        out.push(st.v[1]); // un neurone qui n'est ni masqué ni voisin immédiat du masqué
      }
      return out;
    };
    expect(trace(true)).toEqual(trace(false));
  });

  it("est déterministe pour une même graine, y compris avec du bruit", () => {
    const t = topo();
    const p = lifP({ noise: 0.05 });
    const run = () => {
      const st = createLif(t, p);
      const rng = mulberry32(11);
      const trace: number[] = [];
      for (let k = 0; k < 100; k++) trace.push(stepLif(t, st, p, rng));
      return trace;
    };
    expect(run()).toEqual(run());
  });

  it("compte les décharges cumulées par neurone", () => {
    const t = topo();
    const p = lifP({ refrac: 1 });
    const st = createLif(t, p);
    for (let k = 0; k < 10; k++) {
      st.inject[0] = 10;
      stepLif(t, st, p, mulberry32(1));
    }
    expect(st.spikeTotal[0]).toBeGreaterThan(1);
    expect(meanRate(st, 10)).toBeGreaterThan(0);
  });

  it("dimensionne le tampon circulaire au-delà du plus grand délai", () => {
    const t = topo();
    const st = createLif(t, lifP());
    let dMax = 0;
    for (let e = 0; e < t.e; e++) dMax = Math.max(dMax, t.outDelay[e]);
    expect(st.ringDepth).toBeGreaterThan(dMax);
    expect(st.ring.length).toBe(st.ringDepth * st.n);
  });
});
