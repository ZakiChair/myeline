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

/** Fraction de glomérules actifs dans une odeur. Choix déclaré — à calibrer au lot 2. */
export const DENSITE_ODEUR = 0.3;

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
