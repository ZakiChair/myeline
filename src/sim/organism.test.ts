import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { createOrganism, runOrganism, stepOrganism } from "./organism";
import { ORGANISME_DEFAUT } from "./params";

const cfg = (over = {}) => ({
  ...ORGANISME_DEFAUT,
  brain: {
    ...ORGANISME_DEFAUT.brain,
    topology: { ...ORGANISME_DEFAUT.brain.topology, n: 2500, seed: 4 },
  },
  ...over,
});

/** Vide l'arène : plus rien à manger, la mort est certaine. */
function areneVide(org: ReturnType<typeof createOrganism>) {
  org.world.foodCooldown.fill(1_000_000);
  org.world.toxinCooldown.fill(1_000_000);
}

describe("boucle fermée", () => {
  it("fait avancer le monde à chaque tick, même sans décision", () => {
    const org = createOrganism(cfg());
    for (let k = 0; k < 30; k++) stepOrganism(org, mulberry32(k + 1));
    expect(org.world.t).toBe(30);
    expect(org.metrics.ticks).toBe(30);
  });

  it("prend des décisions et les exécute", () => {
    const org = createOrganism(cfg());
    let decisions = 0;
    for (let k = 0; k < 600; k++) {
      if (stepOrganism(org, mulberry32(k + 1)).action !== null) decisions++;
    }
    expect(decisions).toBeGreaterThan(0);
    expect(org.lastAction).not.toBeNull();
  });

  it("consomme de l'énergie et finit par mourir si rien n'est mangeable", () => {
    const org = createOrganism(cfg());
    areneVide(org);
    runOrganism(org, 4000, mulberry32(7));
    expect(org.metrics.deaths).toBeGreaterThan(0);
    expect(org.metrics.lifetimes.length).toBe(org.metrics.deaths);
    for (const v of org.metrics.lifetimes) expect(v).toBeGreaterThan(0);
  });

  it("est déterministe pour une même graine", () => {
    const run = () => {
      const org = createOrganism(cfg());
      runOrganism(org, 1500, mulberry32(31));
      return {
        x: org.world.x,
        y: org.world.y,
        energy: org.world.energy,
        food: org.world.ateFood,
        toxin: org.world.ateToxin,
        da: org.daLog.slice(0, 200),
      };
    };
    expect(run()).toEqual(run());
  });

  it("sépare la graine du monde de celle du cerveau", () => {
    const a = createOrganism(cfg({ worldSeed: 1 }));
    const b = createOrganism(cfg({ worldSeed: 2 }));
    expect(Array.from(a.world.foodX)).not.toEqual(Array.from(b.world.foodX));
    expect(Array.from(a.brain.topo.outTarget)).toEqual(Array.from(b.brain.topo.outTarget));
  });
});

describe("coutures du lot 3", () => {
  it("ne modifie aucun poids quand lr = 0 (témoin gelé)", () => {
    const org = createOrganism(cfg(), { lr: 0 });
    const avant = Float32Array.from(org.brain.topo.w);
    runOrganism(org, 400, mulberry32(13));
    expect(Array.from(org.brain.topo.w)).toEqual(Array.from(avant));
  });

  it("modifie bien les poids quand lr > 0 (le témoin gelé teste donc quelque chose)", () => {
    const org = createOrganism(cfg());
    const avant = Float32Array.from(org.brain.topo.w);
    runOrganism(org, 400, mulberry32(13));
    expect(Array.from(org.brain.topo.w)).not.toEqual(Array.from(avant));
  });

  it("accepte une source de dopamine substituée (témoin yoked)", () => {
    const donneur = createOrganism(cfg());
    runOrganism(donneur, 800, mulberry32(17));
    expect(donneur.daLog.length).toBe(800);

    const receveur = createOrganism(cfg(), {
      dopamineSource: (ctx) => donneur.daLog[ctx.t - 1] ?? 0,
    });
    runOrganism(receveur, 800, mulberry32(17));
    // La dopamine reçue est celle du donneur, décorrélée des actions présentes.
    expect(receveur.daLog).toEqual(donneur.daLog);
  });

  it("émet un journal d'événements portant les décharges du tick", () => {
    const vus: Array<{ kind: string; n: number; t: number }> = [];
    const org = createOrganism(cfg(), {
      onEvent: (ev) => vus.push({ kind: ev.kind, n: ev.spikeCount, t: ev.t }),
    });
    areneVide(org);
    runOrganism(org, 4000, mulberry32(19));
    expect(vus.length).toBeGreaterThan(0);
    expect(vus.some((v) => v.kind === "DEATH")).toBe(true);
    // Les décharges accompagnent l'événement : de quoi corréler activité et rencontre.
    expect(vus.some((v) => v.n > 0)).toBe(true);
  });

  it("applique le masque de lésion : les neurones masqués ne déchargent jamais", () => {
    const masque = new Uint8Array(2500);
    for (let i = 800; i < 1200; i++) masque[i] = 1;
    const org = createOrganism(cfg(), { lesion: masque });
    runOrganism(org, 600, mulberry32(23));
    for (let i = 800; i < 1200; i++) expect(org.brain.lif.spikeTotal[i]).toBe(0);
    // et le reste du réseau vit toujours
    expect(org.brain.lif.spikeTotal[0] + org.brain.lif.spikeTotal[1500]).toBeGreaterThan(0);
  });

  it("refuse un masque de lésion de la mauvaise taille", () => {
    expect(() => createOrganism(cfg(), { lesion: new Uint8Array(10) })).toThrow();
  });

  it("suit la moyenne glissante des récompenses : la dopamine est une erreur de prédiction", () => {
    const rBars: number[] = [];
    const org = createOrganism(cfg(), {
      dopamineSource: (ctx) => {
        rBars.push(ctx.rBar);
        return ctx.reward - ctx.rBar;
      },
    });
    runOrganism(org, 1200, mulberry32(29));
    expect(new Set(rBars.map((v) => v.toFixed(8))).size).toBeGreaterThan(1);
    // rBar suit les récompenses : le métabolisme seul ne produit rien, mais manger si.
    expect(rBars.some((v) => v !== 0)).toBe(true);
  });
});
