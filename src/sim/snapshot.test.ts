import { describe, expect, it } from "vitest";
import { mulberry32 } from "../lib/rng";
import { createOrganism, runOrganism } from "./organism";
import { ORGANISME_DEFAUT } from "./params";
import { snapshotOrganism } from "./snapshot";

const P = {
  ...ORGANISME_DEFAUT,
  brain: {
    ...ORGANISME_DEFAUT.brain,
    topology: { ...ORGANISME_DEFAUT.brain.topology, n: 2500, seed: 1 },
  },
};

describe("instantané du lot 2", () => {
  it("reflète l'état de l'organisme après des ticks", () => {
    const org = createOrganism(P);
    runOrganism(org, 200, mulberry32(9));
    const s = snapshotOrganism(org, 0.42, 137);

    expect(s.t).toBe(org.brain.lif.t);
    expect(s.acc.length).toBe(4);
    expect(s.accSeuil).toBe(org.brain.params.accSeuil);
    expect(s.world.arena).toBe(P.world.arena);
    expect(s.world.foodX.length).toBe(P.world.nFood);
    expect(s.world.toxinX.length).toBe(P.world.nToxin);
    expect(s.da).toBe(0.42);
    expect(s.measuredTps).toBe(137);
    expect(s.deaths).toBe(org.metrics.deaths);
    expect(s.ateFood).toBe(org.metrics.ateFood);
    expect(s.lastAction).toBe(org.lastAction);
  });

  it("copie les tableaux : muter l'instantané ne touche pas l'organisme", () => {
    const org = createOrganism(P);
    runOrganism(org, 50, mulberry32(9));
    const s = snapshotOrganism(org, 0, 0);

    const foodAvant = org.world.foodX[0];
    const accAvant = org.brain.acc[0];
    s.world.foodX[0] = -999;
    s.acc[0] = -999;
    expect(org.world.foodX[0]).toBe(foodAvant);
    expect(org.brain.acc[0]).toBe(accAvant);
  });
});
