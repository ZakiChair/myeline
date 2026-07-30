import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { createBrain, encodeSensation, stepBrain, motorAccumulators } from "./brain";
import { poolRange, regionById } from "./topology";
import { ACTIONS, CERVEAU_DEFAUT, type Sensation } from "./params";
import { SECTEURS_ALARM, SECTEURS_OLF, SECTEURS_SOMA } from "./world";

const cfg = (over = {}) => ({
  ...CERVEAU_DEFAUT,
  topology: { ...CERVEAU_DEFAUT.topology, n: 2500, seed: 4 },
  ...over,
});

const sensationVide = (): Sensation => ({
  food: new Float32Array(SECTEURS_OLF),
  toxin: new Float32Array(SECTEURS_OLF),
  alarm: new Float32Array(SECTEURS_ALARM),
  soma: new Float32Array(SECTEURS_SOMA),
  energy: 0.5,
});

describe("createBrain", () => {
  it("refuse une plafond de poids incohérent entre topologie et plasticité", () => {
    expect(() =>
      createBrain(cfg({ plasticity: { ...CERVEAU_DEFAUT.plasticity, wMax: 99 } })),
    ).toThrow();
  });

  it("aligne le nombre de pools sensoriels sur les secteurs du monde", () => {
    const b = createBrain(cfg());
    expect(regionById(b.topo, "OLF_FOOD").pools).toBe(SECTEURS_OLF);
    expect(regionById(b.topo, "OLF_TOXIN").pools).toBe(SECTEURS_OLF);
    expect(regionById(b.topo, "ALARM").pools).toBe(SECTEURS_ALARM);
    expect(regionById(b.topo, "SOMA").pools).toBe(SECTEURS_SOMA);
    expect(regionById(b.topo, "MOTOR").pools).toBe(ACTIONS.length);
  });
});

describe("encodeSensation", () => {
  it("injecte du courant dans le pool du secteur excité, et nulle part ailleurs", () => {
    const b = createBrain(cfg());
    const s = sensationVide();
    s.food[3] = 1;
    encodeSensation(b, s);
    const r = regionById(b.topo, "OLF_FOOD");
    const vise = poolRange(r, 3);
    for (let i = vise.start; i < vise.end; i++) expect(b.lif.inject[i]).toBeGreaterThan(0);
    const autre = poolRange(r, 10);
    for (let i = autre.start; i < autre.end; i++) expect(b.lif.inject[i]).toBe(0);
  });

  it("sépare les canaux nourriture et toxine", () => {
    const b = createBrain(cfg());
    const s = sensationVide();
    s.toxin[5] = 1;
    encodeSensation(b, s);
    const food = regionById(b.topo, "OLF_FOOD");
    let sommeFood = 0;
    for (let i = food.start; i < food.start + food.count; i++) sommeFood += b.lif.inject[i];
    expect(sommeFood).toBe(0);
    const tox = poolRange(regionById(b.topo, "OLF_TOXIN"), 5);
    expect(b.lif.inject[tox.start]).toBeGreaterThan(0);
  });

  it("module le courant par l'intensité perçue", () => {
    const b = createBrain(cfg());
    const r = regionById(b.topo, "OLF_FOOD");
    const s = sensationVide();
    s.food[3] = 0.25;
    encodeSensation(b, s);
    const faible = b.lif.inject[poolRange(r, 3).start];
    b.lif.inject.fill(0);
    s.food[3] = 1;
    encodeSensation(b, s);
    const fort = b.lif.inject[poolRange(r, 3).start];
    expect(fort).toBeCloseTo(faible * 4, 5);
  });

  it("code l'énergie par un pic glissant sur les pools intéroceptifs", () => {
    // L'organisme SENT sa faim : elle peut donc moduler la décision.
    const b = createBrain(cfg());
    const inter = regionById(b.topo, "INTERO");
    const picPour = (energy: number) => {
      b.lif.inject.fill(0);
      const s = sensationVide();
      s.energy = energy;
      encodeSensation(b, s);
      let best = -1;
      let bestV = -1;
      for (let pool = 0; pool < inter.pools; pool++) {
        const v = b.lif.inject[poolRange(inter, pool).start];
        if (v > bestV) {
          bestV = v;
          best = pool;
        }
      }
      return best;
    };
    expect(picPour(0)).toBe(0);
    expect(picPour(1)).toBe(inter.pools - 1);
    expect(picPour(0.5)).toBeGreaterThan(picPour(0));
    expect(picPour(0.5)).toBeLessThan(picPour(1));
  });

  it("n'injecte jamais dans le cortex, les pools moteurs ou la VTA", () => {
    // Le comportement DOIT traverser le cortex ; un raccourci d'injection le court-circuiterait.
    const b = createBrain(cfg());
    const s = sensationVide();
    s.food.fill(1);
    s.toxin.fill(1);
    s.alarm.fill(1);
    s.soma.fill(1);
    encodeSensation(b, s);
    for (const id of ["CORTEX", "MOTOR", "VTA"] as const) {
      const r = regionById(b.topo, id);
      for (let i = r.start; i < r.start + r.count; i++) expect(b.lif.inject[i]).toBe(0);
    }
  });
});

describe("décodage moteur par course au seuil", () => {
  it("ne décide rien tant qu'aucun accumulateur n'a franchi le seuil", () => {
    const b = createBrain(cfg({ accSeuil: 1e9, accTimeout: 1e9 }));
    for (let k = 0; k < 50; k++) expect(stepBrain(b, mulberry32(1))).toBeNull();
  });

  it("renvoie l'action du pool qui franchit le seuil, et remet tout à zéro", () => {
    const b = createBrain(cfg({ accTimeout: 1e9 }));
    b.acc[2] = b.params.accSeuil * 0.999;
    const mot = regionById(b.topo, "MOTOR");
    const { start, end } = poolRange(mot, 2);
    for (let i = start; i < end; i++) b.lif.inject[i] = 10;
    const action = stepBrain(b, mulberry32(1));
    expect(action).toBe(ACTIONS[2]);
    expect(Array.from(motorAccumulators(b))).toEqual([0, 0, 0, 0]);
    expect(b.ticksSinceDecision).toBe(0);
    expect(b.lastDecision).toBe(ACTIONS[2]);
  });

  it("accumule la preuve progressivement avant de basculer", () => {
    // C'est ici que se LIT le choix : la preuve monte, puis bascule.
    const b = createBrain(cfg({ accTimeout: 1e9 }));
    const mot = regionById(b.topo, "MOTOR");
    const { start, end } = poolRange(mot, 1);
    // Une fraction du pool seulement : c'est le régime réel, où la preuve monte par petits
    // apports. Saturer tout le pool ferait franchir le seuil dès le premier tick.
    const partiel = start + Math.max(1, Math.round((end - start) / 10));
    const suite: number[] = [];
    let action = null;
    for (let k = 0; k < 400 && action === null; k++) {
      for (let i = start; i < partiel; i++) b.lif.inject[i] = 10;
      action = stepBrain(b, mulberry32(k + 1));
      suite.push(b.acc[1]);
    }
    expect(action).toBe(ACTIONS[1]);
    // Le pool est réfractaire 3 ticks sur 4 : la preuve monte par apports espacés. Ce qui
    // compte est qu'elle PERSISTE entre deux apports au lieu de repartir de zéro — c'est
    // l'intégration temporelle qui rend l'instant du choix visible.
    expect(suite.length).toBeGreaterThan(1 + CERVEAU_DEFAUT.lif.refrac);
    for (let k = 0; k < suite.length - 1; k++) expect(suite[k]).toBeGreaterThan(0);
    expect(suite[suite.length - 1]).toBe(0); // remise à zéro au franchissement
  });

  it("fait décroître les accumulateurs en l'absence de décharges motrices", () => {
    const b = createBrain(cfg({ accSeuil: 1e9, accTimeout: 1e9 }));
    b.acc[0] = 1;
    stepBrain(b, mulberry32(1));
    expect(b.acc[0]).toBeLessThan(1);
    expect(b.acc[0]).toBeGreaterThanOrEqual(0);
  });

  it("force l'action par défaut au bout de accTimeout ticks sans décision", () => {
    const b = createBrain(cfg({ accSeuil: 1e9, accTimeout: 7 }));
    let action: string | null = null;
    for (let k = 0; k < 6; k++) {
      expect(stepBrain(b, mulberry32(k + 1))).toBeNull();
    }
    action = stepBrain(b, mulberry32(7));
    expect(action).toBe(b.params.accDefault);
    expect(b.ticksSinceDecision).toBe(0);
  });

  it("ne garde jamais un accumulateur négatif", () => {
    const b = createBrain(cfg({ accSeuil: 1e9, accTimeout: 1e9 }));
    for (let k = 0; k < 200; k++) {
      stepBrain(b, mulberry32(k + 1));
      for (const v of motorAccumulators(b)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("accumule de l'éligibilité en même temps qu'il décide", () => {
    const b = createBrain(cfg({ accSeuil: 1e9, accTimeout: 1e9 }));
    const s = sensationVide();
    s.food[3] = 1;
    for (let k = 0; k < 120; k++) {
      encodeSensation(b, s);
      stepBrain(b, mulberry32(k + 1));
    }
    let somme = 0;
    for (let e = 0; e < b.topo.e; e++) somme += Math.abs(b.plast.elig[e]);
    expect(somme).toBeGreaterThan(0);
  });

  it("est déterministe pour une même graine", () => {
    const run = () => {
      const b = createBrain(cfg());
      const rng = mulberry32(21);
      const out: Array<string | null> = [];
      for (let k = 0; k < 300; k++) {
        const s = sensationVide();
        s.food[k % SECTEURS_OLF] = 0.7;
        encodeSensation(b, s);
        out.push(stepBrain(b, rng));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
