// Bruit gaussien par table précalculée.
//
// POURQUOI. Le Box–Muller d'origine appelait `Math.log` et `Math.cos` pour CHAQUE neurone à
// CHAQUE tick. Mesuré le 2026-07-30 : 22,44 ns par tirage, soit
//   - 51,7 % du budget par tick à n = 12 000,
//   - 60,7 % à n = 50 000,
//   - 88 % à l'échelle anatomique complète.
// Ce coût est en O(n) et NON en O(arêtes) : le journal de calibration (tâche 8) raisonnait
// comme si les arêtes gouvernaient la montée en échelle, ce qui est faux. Réduire le fan-out
// ne l'aurait pas fait baisser d'un iota.
//
// La table ramène le tirage à 1,10 ns, soit un facteur 20 sur ce poste et ×2,55 mesuré sur la
// boucle LIF complète à n = 50 000 (534 → 1 361 ticks/s).
//
// DÉTERMINISME. `Math.log` et `Math.cos` ne sont pas spécifiés au bit près par ECMAScript :
// 6,94 % des tirages diffèrent entre V8 et JSC en double précision. Le stockage en
// Float32Array efface l'écart — 0 différence sur 10⁷ tirages mesurés — mais c'est une garantie
// PROBABILISTE. Le vecteur d'or de `bruit.test.ts` la rend vérifiable : si elle tombe un jour,
// le test échoue au lieu de laisser un run se corrompre.

import { mulberry32, type RNG } from "../lib/rng";

/**
 * 2^20 entrées, soit 4 Mo.
 *
 * À n = 10^6, chaque entrée est relue ≈ 1 fois par tick. Une table de 2^16 (256 Ko) serait
 * relue ≈ 15 fois, ce qui corrélerait spatialement les neurones AU SEIN d'un même tick — et le
 * régime spontané du réseau est porté par le bruit, donc ce n'est pas un détail numérique.
 */
export const TAILLE_TABLE = 1 << 20;

/**
 * Empreinte FNV-1a des bits de la table, MESURÉE à sa création le 2026-07-30 sous Node 26
 * (V8). Voir le test « VECTEUR D'OR » de bruit.test.ts pour ce qu'elle garantit.
 */
export const EMPREINTE_TABLE = 0xdadd8d87;

let table: Float32Array | null = null;

/** La table, construite à la première demande puis mémoïsée. */
export function tableGauss(): Float32Array {
  if (table !== null) return table;
  const t = new Float32Array(TAILLE_TABLE);
  // Graine fixe : la table est une CONSTANTE du modèle, pas une source de variabilité.
  const rng = mulberry32(0x9e3779b9);
  for (let k = 0; k < TAILLE_TABLE; k++) {
    const u = Math.max(rng(), 1e-12);
    t[k] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }
  table = t;
  return t;
}

/**
 * Un tirage gaussien centré réduit.
 *
 * UN seul appel RNG, contre deux pour Box–Muller : le flux du RNG change donc, et avec lui la
 * dynamique. Assumé au lot 0, où toute la calibration est refaite de toute façon.
 */
export function gaussTable(rng: RNG): number {
  return tableGauss()[(rng() * TAILLE_TABLE) | 0];
}

/** Empreinte FNV-1a des bits bruts de la table, en arithmétique entière donc exacte. */
export function empreinteTable(): number {
  const t = tableGauss();
  const octets = new Uint8Array(t.buffer, t.byteOffset, t.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < octets.length; i++) h = Math.imul(h ^ octets[i], 0x01000193);
  return h >>> 0;
}
