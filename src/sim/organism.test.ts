import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { createOrganism, runOrganism, stepOrganism } from "./organism";
import { derivePoids } from "./metrics";
import { ORGANISME_DEFAUT, PLASTICITE_DEFAUT } from "./params";

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

/**
 * Pose une unique pastille de nourriture sur l'organisme, pour qu'une récompense tombe à coup
 * sûr dès le premier tick.
 *
 * Sans cela, un test qui a besoin d'une récompense dépend de la CHANCE DU TRAJET : il ne teste
 * plus le mécanisme visé mais la probabilité que l'organisme croise une pastille dans la fenêtre
 * choisie. C'est ce qui l'a fait tomber au lot 0, quand la trajectoire a changé.
 */
function pastilleSurPlace(org: ReturnType<typeof createOrganism>) {
  areneVide(org);
  org.world.foodX[0] = org.world.x;
  org.world.foodY[0] = org.world.y;
  org.world.foodCooldown[0] = 0;
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
    // La récompense est GARANTIE, plus tirée du trajet : le test porte sur le mécanisme de
    // moyenne glissante, pas sur la chance de croiser une pastille en 1 200 ticks.
    pastilleSurPlace(org);
    runOrganism(org, 1200, mulberry32(29));
    expect(new Set(rBars.map((v) => v.toFixed(8))).size).toBeGreaterThan(1);
    // rBar suit les récompenses : le métabolisme seul ne produit rien, mais manger si.
    expect(rBars.some((v) => v !== 0)).toBe(true);
  });
});

/**
 * DEUX TÉMOINS DISTINCTS, et le lot 1 les a confondus.
 *
 *   - gelé-APPRENTISSAGE : lr = 0, homéostasie ACTIVE  → isole la règle à trois facteurs ;
 *   - gelé-TOTAL         : lr = 0, homéostasie COUPÉE  → aucun poids ne bouge.
 *
 * Le journal du 2026-07-30 a mesuré que l'homéostasie produit 93 à 96 % du mouvement
 * synaptique. Appeler « gelé » le premier laissait croire au second, et c'est ce qui rendait
 * la comparaison plastique/gelé ininterprétable.
 */
describe("témoins de plasticité", () => {
  const copiePoids = (org: ReturnType<typeof createOrganism>) => Float32Array.from(org.brain.topo.w);

  it("gelé-total : aucun poids ne bouge quand lr = 0 ET l'homéostasie est coupée", () => {
    const org = createOrganism(cfg(), { lr: 0, homeostasis: false });
    const avant = copiePoids(org);
    runOrganism(org, 3000, mulberry32(7));
    const d = derivePoids(org.brain.topo, avant);
    expect(d.bougees).toBe(0);
    expect(d.moyenne).toBe(0);
  }, 300_000);

  it("gelé-apprentissage : l'homéostasie SEULE déplace les poids, même à lr = 0", () => {
    // Épingle le diagnostic mesuré. Sans ce test il peut régresser en silence — et le test
    // préexistant « ne modifie aucun poids quand lr = 0 » ne l'attrape PAS : il ne tourne que
    // 400 ticks pour un homeoEvery de 500, donc l'homéostasie n'y est jamais déclenchée.
    const org = createOrganism(cfg(), { lr: 0, homeostasis: true });
    const avant = copiePoids(org);
    runOrganism(org, 3000, mulberry32(7));
    const d = derivePoids(org.brain.topo, avant);
    expect(d.bougees).toBeGreaterThan(0);
    expect(d.moyenne).toBeGreaterThan(0);
  }, 300_000);

  it("l'homéostasie pèse plus lourd que l'apprentissage — le fait qui a fait échouer le lot 1", () => {
    // Mesuré au lot 1 : 93 à 96 % du mouvement synaptique vient de l'homéostasie.
    // On ne réassertionne pas le pourcentage exact (il dépend de la graine et du régime),
    // mais bien l'ORDRE DE GRANDEUR : le mouvement sous lr = 0 est du même ordre que celui
    // sous plasticité, alors qu'il devrait être négligeable.
    const gele = createOrganism(cfg(), { lr: 0, homeostasis: true });
    const avantGele = copiePoids(gele);
    runOrganism(gele, 3000, mulberry32(7));
    const dGele = derivePoids(gele.brain.topo, avantGele);

    const plastique = createOrganism(cfg(), { homeostasis: true });
    const avantPlast = copiePoids(plastique);
    runOrganism(plastique, 3000, mulberry32(7));
    const dPlast = derivePoids(plastique.brain.topo, avantPlast);

    expect(dGele.moyenne).toBeGreaterThan(dPlast.moyenne * 0.5);
  }, 300_000);

  it("la fenêtre de crédit du lot 0 multiplie par 2 au moins le mouvement dû à la RÈGLE", () => {
    // LE critère de succès de la tâche 4, et il ne peut PAS se lire sur une dérive totale :
    // l'homéostasie balaie toutes les arêtes 40 fois en 20 000 ticks, la règle ne s'applique
    // qu'aux ~30 récompenses rencontrées. Chercher 3 % de signal dans une quantité dominée à
    // 97 % par autre chose, entre deux runs de trajectoires différentes, ne mesure rien.
    //
    // Le témoin gelé-total ayant une dérive EXACTEMENT nulle, couper l'homéostasie rend toute
    // dérive restante imputable à la règle à trois facteurs, sans soustraction ni témoin.
    //
    // MESURÉ le 2026-07-30 sur 3 graines (7, 11, 23), 20 000 ticks, n = 2500 :
    //   fenêtre 60   : dérive 0,001409 — soit 3,4 % du mouvement homéostatique
    //   fenêtre 2500 : dérive 0,004934 — soit 12,0 %
    //   rapport ×3,50, écart entre graines inférieur à 5 %
    // Le seuil est posé à ×2, bien sous la mesure : ce test épingle le GAIN, il ne réassertionne
    // pas un chiffre que la recalibration de la tâche 6 fera bouger.
    const regleSeule = (tauElig: number, dumpEvery: number) => {
      const p = cfg();
      const org = createOrganism(
        { ...p, brain: { ...p.brain, plasticity: { ...p.brain.plasticity, tauElig, dumpEvery } } },
        { homeostasis: false },
      );
      const avant = copiePoids(org);
      runOrganism(org, 20_000, mulberry32(7));
      return derivePoids(org.brain.topo, avant).moyenne;
    };

    const ancienne = regleSeule(60, 16);
    const nouvelle = regleSeule(PLASTICITE_DEFAUT.tauElig, PLASTICITE_DEFAUT.dumpEvery);
    expect(ancienne).toBeGreaterThan(0);
    expect(nouvelle).toBeGreaterThan(ancienne * 2);
  }, 300_000);
});
