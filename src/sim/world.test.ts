import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { createWorld, secteurDe, sense, stepWorld, SECTEURS_OLF } from "./world";
import { MONDE_DEFAUT } from "./params";

const p = MONDE_DEFAUT;

/** Ne laisse qu'une seule pastille active, à la position voulue. */
function unique(
  xs: Float32Array,
  ys: Float32Array,
  cd: Int32Array,
  x: number,
  y: number,
): void {
  cd.fill(1_000_000);
  xs[0] = x;
  ys[0] = y;
  cd[0] = 0;
}

const argmax = (a: Float32Array) => {
  let best = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[best]) best = i;
  return best;
};
const max = (a: Float32Array) => a.reduce((m, v) => (v > m ? v : m), -Infinity);

describe("createWorld", () => {
  it("place l'organisme au centre, plein d'énergie, vivant", () => {
    const w = createWorld(p, mulberry32(1));
    expect(w.x).toBe(0);
    expect(w.y).toBe(0);
    expect(w.energy).toBe(p.energyStart);
    expect(w.alive).toBe(true);
    expect(w.foodX.length).toBe(p.nFood);
    expect(w.toxinX.length).toBe(p.nToxin);
    expect(w.lastLifetime).toBe(0);
  });

  it("dispose nourriture et toxine dans l'arène", () => {
    const w = createWorld(p, mulberry32(1));
    for (let i = 0; i < p.nFood; i++) {
      expect(Math.abs(w.foodX[i])).toBeLessThanOrEqual(p.arena);
      expect(Math.abs(w.foodY[i])).toBeLessThanOrEqual(p.arena);
    }
  });

  it("est déterministe pour une même graine", () => {
    const a = createWorld(p, mulberry32(5));
    const b = createWorld(p, mulberry32(5));
    expect(Array.from(a.foodX)).toEqual(Array.from(b.foodX));
    expect(Array.from(a.toxinY)).toEqual(Array.from(b.toxinY));
  });
});

describe("sensations", () => {
  it("code la nourriture et la toxine avec la MÊME fonction : indiscernables a priori", () => {
    // C'est LA propriété qui rend l'aversion apprenable plutôt que câblée.
    const w = createWorld(p, mulberry32(1));
    unique(w.foodX, w.foodY, w.foodCooldown, 20, 7);
    unique(w.toxinX, w.toxinY, w.toxinCooldown, 20, 7);
    const s = sense(w, p);
    expect(Array.from(s.food)).toEqual(Array.from(s.toxin));
    expect(max(s.food)).toBeGreaterThan(0);
  });

  it("place l'intensité dans le secteur du gisement et décroît avec la distance", () => {
    const w = createWorld(p, mulberry32(1));
    w.toxinCooldown.fill(1_000_000);
    unique(w.foodX, w.foodY, w.foodCooldown, 10, 0); // droit devant (cap 0)
    const proche = sense(w, p).food;
    unique(w.foodX, w.foodY, w.foodCooldown, p.olfRange * 0.9, 0);
    const loin = sense(w, p).food;
    expect(argmax(proche)).toBe(0); // secteur 0 = droit devant
    expect(max(proche)).toBeGreaterThan(max(loin));
    expect(max(loin)).toBeGreaterThan(0);
  });

  it("suit le cap : tourner déplace le gisement de secteur", () => {
    const w = createWorld(p, mulberry32(1));
    w.toxinCooldown.fill(1_000_000);
    unique(w.foodX, w.foodY, w.foodCooldown, 10, 0);
    expect(argmax(sense(w, p).food)).toBe(0);
    w.hx = 0; // l'organisme regarde ailleurs (quart de tour, ancien heading = π/2)
    w.hy = 1;
    expect(argmax(sense(w, p).food)).not.toBe(0);
  });

  it("n'émet rien au-delà de la portée olfactive", () => {
    const w = createWorld(p, mulberry32(1));
    w.toxinCooldown.fill(1_000_000);
    unique(w.foodX, w.foodY, w.foodCooldown, p.olfRange * 2, 0);
    expect(max(sense(w, p).food)).toBe(0);
  });

  it("ignore une pastille consommée tant qu'elle n'a pas réapparu", () => {
    const w = createWorld(p, mulberry32(1));
    w.toxinCooldown.fill(1_000_000);
    unique(w.foodX, w.foodY, w.foodCooldown, 10, 0);
    expect(max(sense(w, p).food)).toBeGreaterThan(0);
    w.foodCooldown[0] = 50;
    expect(max(sense(w, p).food)).toBe(0);
  });

  it("code l'énergie dans [0, 1]", () => {
    const w = createWorld(p, mulberry32(1));
    expect(sense(w, p).energy).toBeCloseTo(p.energyStart / p.energyMax, 5);
    w.energy = 0;
    expect(sense(w, p).energy).toBe(0);
    w.energy = p.energyMax * 2;
    expect(sense(w, p).energy).toBe(1);
  });

  it("allume la somesthésie au contact d'un mur, pas au centre", () => {
    const w = createWorld(p, mulberry32(1));
    expect(max(sense(w, p).soma)).toBe(0);
    w.x = p.arena;
    expect(max(sense(w, p).soma)).toBeGreaterThan(0);
  });
});

describe("stepWorld", () => {
  it("fait payer le métabolisme, plus cher en mouvement qu'au repos", () => {
    const a = createWorld(p, mulberry32(1));
    const b = createWorld(p, mulberry32(1));
    a.foodCooldown.fill(1_000_000);
    a.toxinCooldown.fill(1_000_000);
    b.foodCooldown.fill(1_000_000);
    b.toxinCooldown.fill(1_000_000);
    stepWorld(a, p, "STOP", mulberry32(2));
    stepWorld(b, p, "AVANCER", mulberry32(2));
    expect(a.energy).toBeLessThan(p.energyStart);
    expect(b.energy).toBeLessThan(a.energy);
  });

  it("récompense la nourriture et rend de l'énergie", () => {
    const w = createWorld(p, mulberry32(1));
    w.toxinCooldown.fill(1_000_000);
    unique(w.foodX, w.foodY, w.foodCooldown, 1, 0);
    const r = stepWorld(w, p, "AVANCER", mulberry32(2));
    expect(r.reward).toBeGreaterThan(0);
    expect(r.event).toBe("FOOD");
    expect(w.ateFood).toBe(1);
    expect(w.energy).toBeGreaterThan(p.energyStart);
  });

  it("punit la toxine et retire de l'énergie", () => {
    const w = createWorld(p, mulberry32(1));
    w.foodCooldown.fill(1_000_000);
    unique(w.toxinX, w.toxinY, w.toxinCooldown, 1, 0);
    const r = stepWorld(w, p, "AVANCER", mulberry32(2));
    expect(r.reward).toBeLessThan(0);
    expect(r.event).toBe("TOXIN");
    expect(w.ateToxin).toBe(1);
    expect(w.energy).toBeLessThan(p.energyStart - p.lossToxin + 1);
  });

  it("tourne sans avancer sur GAUCHE et DROITE, en sens opposés", () => {
    const a = createWorld(p, mulberry32(1));
    const b = createWorld(p, mulberry32(1));
    stepWorld(a, p, "GAUCHE", mulberry32(2));
    stepWorld(b, p, "DROITE", mulberry32(2));
    // Le cap part de (1, 0) : après un virage il vaut (turnCos, ±turnSin).
    expect(a.hx).toBeCloseTo(p.turnCos, 12);
    expect(a.hy).toBeCloseTo(p.turnSin, 12);
    expect(b.hx).toBeCloseTo(p.turnCos, 12);
    expect(b.hy).toBeCloseTo(-p.turnSin, 12);
    expect(Math.sqrt(a.x * a.x + a.y * a.y)).toBeCloseTo(0, 6);
  });

  it("garde l'organisme dans l'arène", () => {
    const w = createWorld(p, mulberry32(1));
    for (let k = 0; k < 2000; k++) stepWorld(w, p, "AVANCER", mulberry32(k + 1));
    expect(Math.abs(w.x)).toBeLessThanOrEqual(p.arena);
    expect(Math.abs(w.y)).toBeLessThanOrEqual(p.arena);
  });

  it("fait mourir à énergie nulle, réapparaître au centre, et enregistre la durée de vie", () => {
    const w = createWorld(p, mulberry32(1));
    w.foodCooldown.fill(1_000_000);
    w.toxinCooldown.fill(1_000_000);
    for (let k = 0; k < 40; k++) stepWorld(w, p, "STOP", mulberry32(k + 5));
    w.energy = p.metabRest * 0.5; // il ne survit pas au prochain tick
    const r = stepWorld(w, p, "STOP", mulberry32(2));
    expect(r.died).toBe(true);
    expect(r.event).toBe("DEATH");
    expect(w.deaths).toBe(1);
    expect(w.lastLifetime).toBe(41);
    expect(w.x).toBe(0);
    expect(w.y).toBe(0);
    expect(w.energy).toBe(p.energyStart);
    expect(w.lifeTicks).toBe(0);
    expect(w.alive).toBe(true); // le cerveau est conservé : une nouvelle vie commence
  });

  it("fait poursuivre le prédateur quand l'organisme est à portée de détection", () => {
    const w = createWorld(p, mulberry32(1));
    w.foodCooldown.fill(1_000_000);
    w.toxinCooldown.fill(1_000_000);
    w.x = 0;
    w.y = 0;
    w.predX = p.predatorSense * 0.5;
    w.predY = 0;
    const d0 = Math.hypot(w.predX - w.x, w.predY - w.y);
    stepWorld(w, p, "STOP", mulberry32(2));
    expect(Math.hypot(w.predX - w.x, w.predY - w.y)).toBeLessThan(d0);
  });

  it("punit le contact du prédateur", () => {
    const w = createWorld(p, mulberry32(1));
    w.foodCooldown.fill(1_000_000);
    w.toxinCooldown.fill(1_000_000);
    w.predX = 1;
    w.predY = 0;
    const r = stepWorld(w, p, "STOP", mulberry32(2));
    expect(r.event).toBe("PREDATOR");
    expect(r.reward).toBeLessThan(0);
    expect(w.hits).toBe(1);
  });

  it("émet l'alarme bien au-delà de la portée de contact : la fuite est apprenable", () => {
    expect(p.alarmRange).toBeGreaterThan(p.predatorContact * 4);
    const w = createWorld(p, mulberry32(1));
    w.predX = p.alarmRange * 0.5;
    w.predY = 0;
    expect(max(sense(w, p).alarm)).toBeGreaterThan(0);
  });

  it("fait réapparaître une pastille consommée après respawnEvery ticks", () => {
    const w = createWorld(p, mulberry32(1));
    w.toxinCooldown.fill(1_000_000);
    unique(w.foodX, w.foodY, w.foodCooldown, 1, 0);
    stepWorld(w, p, "AVANCER", mulberry32(2));
    const attente = w.foodCooldown[0];
    expect(attente).toBeGreaterThan(0);
    for (let k = 0; k < attente - 1; k++) stepWorld(w, p, "STOP", mulberry32(k + 3));
    expect(w.foodCooldown[0]).toBeGreaterThan(0); // toujours absente
    stepWorld(w, p, "STOP", mulberry32(999));
    expect(w.foodCooldown[0]).toBe(0); // et de retour
  });

  it("est déterministe : même graine, même trajectoire", () => {
    const run = () => {
      const w = createWorld(p, mulberry32(9));
      const rng = mulberry32(10);
      const acts = ["AVANCER", "GAUCHE", "AVANCER", "DROITE"] as const;
      const trace: number[] = [];
      for (let k = 0; k < 500; k++) trace.push(stepWorld(w, p, acts[k % 4], rng).reward);
      return { trace, x: w.x, y: w.y, energy: w.energy, mangé: w.ateFood };
    };
    expect(run()).toEqual(run());
  });
});

/**
 * PORTABILITÉ ENTRE MOTEURS JAVASCRIPT.
 *
 * Mesuré le 2026-07-30 en exécutant le même bundle sous V8 (Node) et sous JSC (Bun, le moteur
 * de Safari) : le RÉSEAU est bit-identique à n = 50 000 sur 400 000 ticks, mais l'organisme
 * complet diverge dès le tick ≈ 17 942, pour finir à 89,6 unités d'écart dans une arène de
 * demi-côté 80. Le coupable est ce module, et lui seul.
 *
 * La cause : ECMAScript ne spécifie PAS au bit près les fonctions transcendantes. Ici elles
 * alimentaient des comparaisons de seuil et des index de secteur ENTIERS — des amplificateurs
 * discrets, qu'aucun arrondi ne rattrape.
 *
 * On ne les réimplémente pas, on les SUPPRIME. Chaque remplacement est exact.
 */
describe("portabilité : aucune fonction transcendante", () => {
  it("n'appelle aucune transcendante dans un pas de monde", () => {
    // Test STRUCTUREL, et il faut qu'il le soit : un test de VALEUR ne les attraperait pas.
    // Ces fonctions donnent le bon résultat, simplement pas les mêmes bits selon le moteur.
    const pieges = ["exp", "log", "cos", "sin", "atan2", "hypot", "cbrt", "tan", "asin", "acos"] as const;
    const originaux = pieges.map((n) => [n, Math[n]] as const);
    const appels: string[] = [];
    // Remplacement volontaire des méthodes de Math, restauré dans le `finally`.
    const cible = Math as unknown as Record<string, (...a: number[]) => number>;
    for (const [nom, vrai] of originaux) {
      cible[nom] = (...a: number[]) => {
        appels.push(nom);
        return (vrai as (...x: number[]) => number)(...a);
      };
    }
    try {
      const w = createWorld(p, mulberry32(3));
      const rng = mulberry32(9);
      for (let k = 0; k < 500; k++) {
        sense(w, p);
        stepWorld(w, p, k % 3 === 0 ? "AVANCER" : k % 3 === 1 ? "GAUCHE" : "DROITE", rng);
      }
    } finally {
      for (const [nom, vrai] of originaux) {
        cible[nom] = vrai as (...a: number[]) => number;
      }
    }
    expect(appels).toEqual([]);
  });

  it("garde le cap sur le cercle unité sur 20 000 rotations", () => {
    // Une rotation répétée fait dériver la norme si turnCos² + turnSin² ≠ 1 exactement en
    // flottant — et elle ne vaut jamais 1 exactement. D'où la renormalisation à chaque pas.
    const w = createWorld(p, mulberry32(3));
    const rng = mulberry32(9);
    for (let k = 0; k < 20_000; k++) stepWorld(w, p, "GAUCHE", rng);
    expect(Math.sqrt(w.hx * w.hx + w.hy * w.hy)).toBeCloseTo(1, 9);
  }, 60_000);

  it("donne le même secteur que l'ancien calcul par angle, sur 360 directions", () => {
    // Équivalence stricte avec `round(atan2(ry, rx) / pas)`, la formule remplacée.
    const S = SECTEURS_OLF;
    const pas = (2 * Math.PI) / S;
    for (let deg = 0; deg < 360; deg++) {
      const a = (deg * Math.PI) / 180 - Math.PI;
      const attendu = ((Math.round(a / pas) % S) + S) % S;
      expect(secteurDe(Math.cos(a), Math.sin(a), S)).toBe(attendu);
    }
  });

  it("ignore l'échelle du vecteur : seule la direction compte", () => {
    for (const echelle of [0.001, 1, 1000]) {
      expect(secteurDe(0.6 * echelle, 0.8 * echelle, SECTEURS_OLF)).toBe(
        secteurDe(0.6, 0.8, SECTEURS_OLF),
      );
    }
  });
});
