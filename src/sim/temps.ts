// Le temps du modèle, exprimé en SECONDES et converti en ticks à la construction.
//
// POURQUOI. Tant que les constantes sont écrites en ticks, rien ne dit ce qu'un tick vaut, et il
// devient impossible de voir qu'elles sont incohérentes ENTRE ELLES. Mesuré le 2026-07-30 :
// `tauElig / tauM` valait 3 dans le noyau, contre 50 à 1 000 en biologie et ≈ 150 chez l'abeille
// (intervalle CS-US antérograde optimal ≈ 3 s, publié ; membrane ≈ 20 ms). La fenêtre de crédit
// était donc environ 50 FOIS trop courte — ce qui réhabilite l'hypothèse 2 du journal de
// calibration, qu'il classait « partiellement écartée » : elle n'était pas partiellement vraie,
// elle était vraie d'un facteur 50, et le journal ne pouvait pas le voir faute d'unité de
// référence.
//
// DEUX HORLOGES (décision de Zaki, 2026-07-30) : 1 ms pour les tests finaux, 10 ms pour le
// débogage. ⚠️ À 10 ms le réfractaire et les délais axonaux tombent sous le tick. Or `lif.ts`
// documente comme NON NÉGOCIABLE qu'un délai vaille au moins 1 tick — c'est ce qui rend « avant »
// et « après » distinguables, prérequis de la plasticité. Ce mode vérifie donc que la plomberie
// tourne ; il ne peut PAS servir à déboguer l'apprentissage. Pour itérer vite SUR l'apprentissage,
// réduire `n` et le nombre de sujets : même physique, aucune perte de fidélité.

import type { LifParams, PlasticityParams } from "./params";

/** Secondes par tick. À 1 ms, la membrane vaut 20 ticks — la valeur physiologique. */
export const DT_DEFAUT = 0.001;

/** Au-delà de cette erreur relative d'arrondi, la constante est signalée comme déformée. */
const DEFORMATION_TOLEREE = 0.1;

/**
 * Convertit une durée en ticks, avec PLANCHER à 1.
 *
 * DEUX motifs d'avertissement, et le second est le moins évident :
 *
 *  1. **Plancher.** Une constante qui arrondirait à 0 casserait le modèle en silence : un
 *     réfractaire nul laisse un neurone décharger à chaque tick, un délai nul supprime la
 *     distinction avant/après dont `lif.ts` fait un prérequis non négociable.
 *  2. **Déformation.** Une constante peut arrondir à un entier valide tout en étant nettement
 *     déplacée. À dt = 10 ms, le délai axonal de 8 ms vaut 0,8 tick : il arrondit à 1, donc
 *     aucun plancher ne se déclenche — mais le délai est devenu 10 ms, soit 25 % de plus que
 *     demandé. Ne surveiller que le plancher laisserait passer exactement le genre de dérive
 *     silencieuse que ce module existe pour empêcher.
 *
 * Chaque cas est NOMMÉ dans `avertissements`, jamais tu.
 */
export function enTicks(
  secondes: number,
  dt: number,
  nom: string,
  avertissements: string[],
): number {
  if (!(dt > 0)) throw new Error(`dt doit être positif, reçu ${dt}`);
  const brut = secondes / dt;
  const fr = (v: number) => v.toFixed(2).replace(".", ",");
  if (brut < 1) {
    avertissements.push(
      `${nom} : ${secondes} s vaut ${fr(brut)} tick à dt = ${dt} s, porté au plancher de 1. ` +
        `Le modèle N'EST PAS physiologique à cette résolution.`,
    );
    return 1;
  }
  const t = Math.round(brut);
  const deformation = Math.abs(t - brut) / brut;
  if (deformation > DEFORMATION_TOLEREE) {
    avertissements.push(
      `${nom} : ${secondes} s vaut ${fr(brut)} tick à dt = ${dt} s, arrondi à ${t} — ` +
        `soit ${fr(deformation * 100)} % d'écart. La constante est déformée par la résolution.`,
    );
  }
  return t;
}

// ─── Le neurone, en secondes ────────────────────────────────────────────────────────────

/** Constantes du neurone en SECONDES : ce sont elles la source de vérité, plus les ticks. */
export const LIF_SECONDES = {
  /** Constante de fuite membranaire. 20 ms, valeur physiologique usuelle. */
  tauM: 0.02,
  /** Fuite du courant synaptique. */
  tauS: 0.005,
  /** Retour du seuil vers sa base. */
  tauThr: 0.12,
  /** Période réfractaire. */
  refrac: 0.003,
  // Ce qui suit n'est pas une durée : recopié tel quel.
  vRest: 0,
  vReset: 0,
  thrBase: 1,
  thrJump: 0.18,
  noise: 0.08,
};

export function resoudreLif(
  sec: typeof LIF_SECONDES,
  dt: number,
): { params: LifParams; avertissements: string[] } {
  const a: string[] = [];
  return {
    params: {
      tauM: enTicks(sec.tauM, dt, "tauM", a),
      tauS: enTicks(sec.tauS, dt, "tauS", a),
      tauThr: enTicks(sec.tauThr, dt, "tauThr", a),
      refrac: enTicks(sec.refrac, dt, "refrac", a),
      vRest: sec.vRest,
      vReset: sec.vReset,
      thrBase: sec.thrBase,
      thrJump: sec.thrJump,
      noise: sec.noise,
    },
    avertissements: a,
  };
}

// ─── La plasticité, en secondes ─────────────────────────────────────────────────────────

/**
 * Constantes de plasticité en SECONDES.
 *
 * `tauElig` = 2,5 s est LE changement de fond : à dt = 1 ms cela fait 2 500 ticks au lieu des 60
 * du noyau d'origine. Valeur choisie pour qu'il reste une fraction utile d'éligibilité au moment
 * du renforcement, sachant que l'intervalle CS-US antérograde optimal publié chez l'abeille vaut
 * ≈ 3 s (Giurfa et al. 2009).
 */
export const PLASTICITE_SECONDES = {
  tauPre: 0.02,
  tauPost: 0.02,
  /** La fenêtre de crédit temporel. Voir l'entête : le noyau était ~50× trop court. */
  tauElig: 2.5,
  /**
   * Cadence du déversement dopaminergique. 250 ms, soit un dixième de la fenêtre de crédit —
   * les 16 ticks d'origine seraient absurdement fréquents face à 2 500.
   */
  dumpEvery: 0.25,
  /** Cadence de l'homéostasie. */
  homeoEvery: 0.5,
  // Ce qui suit n'est pas une durée.
  aPlus: 0.012,
  // Légèrement inférieur à aPlus : le choix standard qui évite la dérive vers zéro d'un
  // réseau à activité irrégulière.
  aMinus: 0.0105,
  lr: 0.05,
  dumpNow: 0.6,
  homeoRate: 0.15,
  homeoClamp: 0.05,
  wMax: 3.0,
};

export function resoudrePlasticite(
  sec: typeof PLASTICITE_SECONDES,
  dt: number,
): { params: PlasticityParams; avertissements: string[] } {
  const a: string[] = [];
  return {
    params: {
      tauPre: enTicks(sec.tauPre, dt, "tauPre", a),
      tauPost: enTicks(sec.tauPost, dt, "tauPost", a),
      tauElig: enTicks(sec.tauElig, dt, "tauElig", a),
      dumpEvery: enTicks(sec.dumpEvery, dt, "dumpEvery", a),
      homeoEvery: enTicks(sec.homeoEvery, dt, "homeoEvery", a),
      aPlus: sec.aPlus,
      aMinus: sec.aMinus,
      lr: sec.lr,
      dumpNow: sec.dumpNow,
      homeoRate: sec.homeoRate,
      homeoClamp: sec.homeoClamp,
      wMax: sec.wMax,
    },
    avertissements: a,
  };
}

/** Délai axonal maximal, en secondes. 8 ms : 8 ticks à dt = 1 ms. */
export const DELAI_MAX_SECONDES = 0.008;

export function resoudreDelaiMax(dt: number): { delayMax: number; avertissements: string[] } {
  const a: string[] = [];
  return { delayMax: enTicks(DELAI_MAX_SECONDES, dt, "delayMax", a), avertissements: a };
}
