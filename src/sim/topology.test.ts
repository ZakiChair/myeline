import { describe, it, expect } from "vitest";
import { buildTopology, regionById, poolRange } from "./topology";
import { TOPOLOGIE_DEFAUT } from "./params";

const p = (over = {}) => ({ ...TOPOLOGIE_DEFAUT, n: 3000, seed: 7, ...over });

describe("buildTopology", () => {
  it("répartit exactement n neurones entre les régions, sans trou ni chevauchement", () => {
    const t = buildTopology(p());
    expect(t.regions.reduce((s, r) => s + r.count, 0)).toBe(t.n);
    let attendu = 0;
    for (const r of t.regions) {
      expect(r.start).toBe(attendu);
      if (r.id !== "CORTEX") expect(r.count).toBe(r.pools * r.poolSize);
      attendu += r.count;
    }
    expect(attendu).toBe(3000);
  });

  it("donne au cortex la majorité des neurones", () => {
    const t = buildTopology(p());
    expect(regionById(t, "CORTEX").count).toBeGreaterThan(t.n / 2);
  });

  it("respecte la loi de Dale : signe fixe, part d'inhibiteurs corticaux conforme", () => {
    const t = buildTopology(p());
    const ctx = regionById(t, "CORTEX");
    let inh = 0;
    for (let i = ctx.start; i < ctx.start + ctx.count; i++) {
      expect(t.sign[i] === 1 || t.sign[i] === -1).toBe(true);
      if (t.sign[i] === -1) inh++;
    }
    const part = inh / ctx.count;
    expect(part).toBeGreaterThan(TOPOLOGIE_DEFAUT.fracInh - 0.03);
    expect(part).toBeLessThan(TOPOLOGIE_DEFAUT.fracInh + 0.03);
  });

  it("aligne le signe du poids sur le signe du neurone source", () => {
    const t = buildTopology(p());
    for (let i = 0; i < t.n; i++) {
      for (let k = t.outOffsets[i]; k < t.outOffsets[i + 1]; k++) {
        if (t.sign[i] === 1) expect(t.w[k]).toBeGreaterThan(0);
        else expect(t.w[k]).toBeLessThan(0);
        expect(Math.abs(t.w[k])).toBeLessThanOrEqual(TOPOLOGIE_DEFAUT.wMax);
      }
    }
  });

  it("construit un CSR entrant cohérent avec le CSR sortant", () => {
    const t = buildTopology(p());
    expect(t.inOffsets[t.n]).toBe(t.e);
    const vues = new Set<number>();
    for (let j = 0; j < t.n; j++) {
      for (let k = t.inOffsets[j]; k < t.inOffsets[j + 1]; k++) {
        const e = t.inEdge[k];
        expect(vues.has(e)).toBe(false);
        vues.add(e);
        expect(t.outTarget[e]).toBe(j); // l'arête vise bien j
        const src = t.inSource[k];
        expect(e).toBeGreaterThanOrEqual(t.outOffsets[src]);
        expect(e).toBeLessThan(t.outOffsets[src + 1]); // et part bien de src
      }
    }
    expect(vues.size).toBe(t.e);
  });

  it("place les délais axonaux dans [1, delayMax] et interdit les boucles sur soi", () => {
    const t = buildTopology(p());
    for (let e = 0; e < t.e; e++) {
      expect(t.outDelay[e]).toBeGreaterThanOrEqual(1);
      expect(t.outDelay[e]).toBeLessThanOrEqual(TOPOLOGIE_DEFAUT.delayMax);
    }
    for (let i = 0; i < t.n; i++) {
      for (let k = t.outOffsets[i]; k < t.outOffsets[i + 1]; k++) {
        expect(t.outTarget[k]).not.toBe(i);
      }
    }
  });

  it("ne câble jamais un capteur directement sur un pool moteur", () => {
    const t = buildTopology(p());
    const mot = regionById(t, "MOTOR");
    for (const id of ["OLF_FOOD", "OLF_TOXIN", "ALARM", "SOMA", "INTERO"] as const) {
      const r = regionById(t, id);
      for (let i = r.start; i < r.start + r.count; i++) {
        for (let k = t.outOffsets[i]; k < t.outOffsets[i + 1]; k++) {
          const cible = t.outTarget[k];
          expect(cible >= mot.start && cible < mot.start + mot.count).toBe(false);
        }
      }
    }
  });

  it("laisse les pools moteurs et la VTA sans arête sortante", () => {
    const t = buildTopology(p());
    for (const id of ["MOTOR", "VTA"] as const) {
      const r = regionById(t, id);
      for (let i = r.start; i < r.start + r.count; i++) {
        expect(t.outOffsets[i + 1] - t.outOffsets[i]).toBe(0);
      }
    }
  });

  it("donne aux pools moteurs des entrées corticales", () => {
    const t = buildTopology(p());
    const mot = regionById(t, "MOTOR");
    const ctx = regionById(t, "CORTEX");
    for (let j = mot.start; j < mot.start + mot.count; j++) {
      expect(t.inOffsets[j + 1] - t.inOffsets[j]).toBeGreaterThan(0);
      for (let k = t.inOffsets[j]; k < t.inOffsets[j + 1]; k++) {
        const src = t.inSource[k];
        expect(src >= ctx.start && src < ctx.start + ctx.count).toBe(true);
      }
    }
  });

  it("est déterministe pour une même graine et différente pour une autre", () => {
    const a = buildTopology(p({ seed: 42 }));
    const b = buildTopology(p({ seed: 42 }));
    const c = buildTopology(p({ seed: 43 }));
    expect(Array.from(a.outTarget)).toEqual(Array.from(b.outTarget));
    expect(Array.from(a.w)).toEqual(Array.from(b.w));
    expect(Array.from(a.outTarget)).not.toEqual(Array.from(c.outTarget));
  });

  it("expose les bornes d'un pool", () => {
    const t = buildTopology(p());
    const olf = regionById(t, "OLF_FOOD");
    const r0 = poolRange(olf, 0);
    const r1 = poolRange(olf, 1);
    expect(r0.end).toBe(r1.start);
    expect(r0.end - r0.start).toBe(olf.poolSize);
  });

  it("retrouve exactement les tailles de la conception à n = 50 000", () => {
    const t = buildTopology({ ...TOPOLOGIE_DEFAUT, n: 50_000, seed: 1 });
    const taille = (id: Parameters<typeof regionById>[1]) => regionById(t, id).count;
    expect(taille("OLF_FOOD")).toBe(1440);
    expect(taille("OLF_TOXIN")).toBe(1440);
    expect(taille("ALARM")).toBe(800);
    expect(taille("SOMA")).toBe(320);
    expect(taille("INTERO")).toBe(480);
    expect(taille("MOTOR")).toBe(2000);
    expect(taille("VTA")).toBe(20);
    expect(taille("CORTEX")).toBe(43_500);
  });

  it("lève sur une région inconnue", () => {
    const t = buildTopology(p());
    // @ts-expect-error région volontairement invalide
    expect(() => regionById(t, "NEXISTE_PAS")).toThrow();
  });
});
