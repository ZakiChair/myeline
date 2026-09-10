// Statistiques du banc — Fisher exact, le test de la porte du lot 1.
//
// Entièrement en BigInt : exact à toute taille de banc, sans fonction transcendante,
// donc portable et reproductible — le même standard que le noyau. (Pas de littéraux
// `0n` : la cible TS du projet est < ES2020 ; le constructeur BigInt() est licite.)

const ZERO = BigInt(0);
const UN = BigInt(1);

/** C(n, k) exact. */
function binom(n: number, k: number): bigint {
  if (k < 0 || k > n) return ZERO;
  k = Math.min(k, n - k);
  let r = UN;
  for (let i = 0; i < k; i++) r = (r * BigInt(n - i)) / BigInt(i + 1);
  return r;
}

/**
 * Test exact de Fisher, unilatéral : P(X ≥ a) pour la table [[a, b], [c, d]] à marges
 * fixées — loi hypergéométrique. Mesure « le groupe apparié répond-il strictement plus
 * que le témoin » sur deux échantillons binaires indépendants.
 */
export function fisherExact(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  const r1 = a + b;
  const c1 = a + c;
  const total = binom(n, c1);
  const lo = Math.max(a, c1 - (n - r1));
  const hi = Math.min(r1, c1);
  let num = ZERO;
  for (let x = lo; x <= hi; x++) num += binom(r1, x) * binom(n - r1, c1 - x);
  return Number(num) / Number(total);
}
