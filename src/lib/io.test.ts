import { describe, it, expect } from "vitest";
import { applyInput, readState, runSchedule } from "./io";
import { scaleGraphFromEdges, type ScaleGraph } from "./scale-engine";
import { mulberry32 } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimParams } from "./types";

const params = (over: Partial<SimParams> = {}): SimParams => ({
  ...DEFAULT_PARAMS,
  populationCap: 100000,
  spontaneous: 0,
  ...over,
});

describe("applyInput (électrode / clamp)", () => {
  it("force les slots ciblés à décharger ce tick (state=1, cooldown=0, vitalité montée)", () => {
    const g: ScaleGraph = scaleGraphFromEdges([{ state: 0, vitality: 0 }, { state: 0 }], [[0, 1]]);
    applyInput(g, [0]);
    expect(g.state[0]).toBe(1);
    expect(g.cooldown[0]).toBe(0);
    expect(g.vitality[0]).toBe(8); // +VIT_GAIN
    expect(g.state[1]).toBe(0); // non ciblé
  });

  it("ignore les slots morts", () => {
    const g = scaleGraphFromEdges([{ state: 0 }], []);
    g.alive[0] = 0;
    applyInput(g, [0]);
    expect(g.state[0]).toBe(0);
  });
});

describe("readState (lecture du vecteur d'état)", () => {
  it("lit l'état des slots demandés dans l'ordre", () => {
    const g = scaleGraphFromEdges([{ state: 1 }, { state: 0 }, { state: 1 }], []);
    expect(readState(g, [2, 0, 1])).toEqual([1, 1, 0]);
  });

  it("lit tous les vivants quand aucun slot n'est précisé", () => {
    const g = scaleGraphFromEdges([{ state: 1 }, { state: 0 }, { state: 1 }], []);
    g.alive[1] = 0; // mort → exclu
    expect(readState(g)).toEqual([1, 1]);
  });
});

describe("runSchedule (ticks programmés, entrée avant stepScale)", () => {
  it("injecte l'entrée puis avance, et propage : seed(0) → 1 décharge au tick suivant", () => {
    const g = scaleGraphFromEdges([{ state: 0 }, { state: 0 }], [[0, 1, 5]]);
    const { excited } = runSchedule(g, params({ fireFraction: 0.16, refractory: 2 }), mulberry32(1), [
      { input: [0] }, // tick 1 : stimule 0
      {}, // tick 2 : rien
    ]);
    // tick1 : 0 décharge (clamp) → réfractaire ; 1 voit 0 excité (5/5 ≥ 0.16) → décharge.
    expect(excited[0]).toBe(1); // un neurone (le 1) a déchargé
    // tick2 : 0 réfractaire, 1 passe réfractaire → personne ne décharge.
    expect(excited[1]).toBe(0);
  });
});
