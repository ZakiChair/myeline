// Générateur pseudo-aléatoire déterministe et seedable (mulberry32).
// Permet des réseaux reproductibles (même graine ⇒ même évolution) et des tests stables.

export type RNG = () => number;

/** Crée un RNG déterministe à partir d'une graine entière 32 bits. */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entier aléatoire dans [min, max] (bornes incluses). */
export function randInt(rng: RNG, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Graine aléatoire pour démarrer un nouveau réseau. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
