// Générateur d'odeurs paramétrique — spec §7. Une odeur est un vecteur d'intensités sur
// les glomérules : un sous-ensemble actif, tiré au sort. La calibration de cet espace sur
// le gradient de généralisation publié (53/31/23) est la fiche du lot 2 — jusqu'ici, la
// densité est un choix déclaré, pas calibré.

import { randInt, type RNG } from "../../lib/rng";

export interface Odeur {
  nom: string;
  /** [nGlom] intensité dans [0, 1], nulle sur les glomérules inactifs. */
  intensites: Float32Array;
}

/** Fraction de glomérules actifs dans une odeur. MESURÉ : 0,2 donne le code KC épars
 *  du régime calibré (~2,5 % de répondantes) ; à 0,3 il redevient dense. */
export const DENSITE_ODEUR = 0.2;

/** Tire une odeur : `densite` × nGlom glomérules actifs à intensité uniforme-tirée. */
export function genererOdeur(rng: RNG, nGlom: number, nom: string, densite = DENSITE_ODEUR): Odeur {
  const intensites = new Float32Array(nGlom);
  const nActifs = Math.max(1, Math.round(nGlom * densite));
  // Tirage sans remise (Fisher–Yates partiel).
  const choix = new Int32Array(nGlom);
  for (let g = 0; g < nGlom; g++) choix[g] = g;
  for (let q = 0; q < nActifs; q++) {
    const j = q + randInt(rng, 0, nGlom - 1 - q);
    const g = choix[j];
    choix[j] = choix[q];
    choix[q] = g;
    intensites[g] = 0.5 + 0.5 * rng();
  }
  return { nom, intensites };
}

/** Indices des glomérules actifs d'une odeur. */
export function actifs(odeur: Odeur): Int32Array {
  const xs: number[] = [];
  for (let g = 0; g < odeur.intensites.length; g++) {
    if (odeur.intensites[g] > 0) xs.push(g);
  }
  return Int32Array.from(xs);
}

/**
 * Distance entre deux odeurs : fraction des glomérules actifs de `a` inactifs dans `b`.
 * 0 = même support, 1 = supports disjoints. Symétrique si les deux ont la même densité.
 */
export function distanceOdeur(a: Odeur, b: Odeur): number {
  const sa = actifs(a);
  if (sa.length === 0) return 1;
  let communs = 0;
  for (const g of sa) if (b.intensites[g] > 0) communs++;
  return 1 - communs / sa.length;
}

/**
 * Décline `base` en remplaçant exactement `nRemplace` de ses glomérules actifs
 * (intensités retirées) par autant de NOUVEAUX, hors du support de base. La distance
 * est le compte entier — la résolution de l'encodeur est le glomérule.
 */
export function declinerN(rng: RNG, base: Odeur, nRemplace: number, nom: string): Odeur {
  const n = base.intensites.length;
  const sa = actifs(base);
  const intensites = new Float32Array(base.intensites);

  // Les glomérules à éteindre (tirés parmi les actifs de base).
  const ordreActifs = Int32Array.from(sa);
  for (let q = 0; q < nRemplace; q++) {
    const j = q + randInt(rng, 0, sa.length - 1 - q);
    const g = ordreActifs[j];
    ordreActifs[j] = ordreActifs[q];
    ordreActifs[q] = g;
    intensites[g] = 0;
  }
  // Autant de nouveaux, hors du support d'origine.
  const inactifs: number[] = [];
  for (let g = 0; g < n; g++) if (base.intensites[g] === 0) inactifs.push(g);
  for (let q = 0; q < nRemplace; q++) {
    if (inactifs.length === 0) break;
    const j = randInt(rng, 0, inactifs.length - 1 - q);
    const g = inactifs[j];
    inactifs[j] = inactifs[inactifs.length - 1 - q];
    inactifs.pop();
    intensites[g] = 0.5 + 0.5 * rng();
  }
  return { nom, intensites };
}

/**
 * Décline `base` à distance `rho` ∈ [0,1] : fraction des actifs remplacés.
 * Wrapper continu de `declinerN` — utile pour les balayages grossiers.
 */
export function decliner(rng: RNG, base: Odeur, rho: number, nom: string): Odeur {
  return declinerN(rng, base, Math.round(actifs(base).length * rho), nom);
}
