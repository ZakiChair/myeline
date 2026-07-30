// Types et valeurs par défaut partagés par tout le noyau « Vie ».
//
// LE TICK EST L'UNITÉ DE TEMPS. Toutes les constantes temporelles (τm, τs, τthr, τe, délais
// axonaux, métabolisme) s'expriment en ticks. On n'affirme AUCUNE correspondance en secondes :
// un « taux de décharge » est en décharges par neurone et par tick.

// ─── Régions ────────────────────────────────────────────────────────────────────────────

export type RegionId =
  | "OLF_FOOD"
  | "OLF_TOXIN"
  | "ALARM"
  | "SOMA"
  | "INTERO"
  | "CORTEX"
  | "MOTOR"
  | "VTA";

export interface Region {
  id: RegionId;
  /** Premier indice de neurone de la région. */
  start: number;
  count: number;
  /** Nombre de sous-pools (secteurs). Le cortex n'en a qu'un. */
  pools: number;
  /** count === pools * poolSize (sauf CORTEX, dont le pool unique vaut count). */
  poolSize: number;
}

// ─── Action et sensation : le contrat entre le monde et le cerveau ──────────────────────

export type MotorAction = "GAUCHE" | "DROITE" | "AVANCER" | "STOP";

/** L'ordre fait foi : ACTIONS[k] est l'action du pool moteur k. */
export const ACTIONS: readonly MotorAction[] = ["GAUCHE", "DROITE", "AVANCER", "STOP"];

/** Ce que l'organisme perçoit à un tick. Intensités dans [0, 1]. */
export interface Sensation {
  /** [24] par secteur de cap. */
  food: Float32Array;
  /** [24] — MÊME encodage que `food` : indiscernable a priori, seul le canal diffère. */
  toxin: Float32Array;
  /** [16] signature du prédateur. */
  alarm: Float32Array;
  /** [8] contact / collision. */
  soma: Float32Array;
  /** Fraction de l'énergie maximale, dans [0, 1]. */
  energy: number;
}

// ─── Topologie ──────────────────────────────────────────────────────────────────────────

export interface TopologyParams {
  /** Taille totale visée. Les tailles de région s'en déduisent : jamais de littéral. */
  n: number;
  seed: number;
  /** Sorties corticales par neurone cortical. */
  kCortex: number;
  /** Sorties par neurone sensoriel (vers le cortex). */
  kSensory: number;
  /** Entrées corticales par neurone moteur. */
  kMotorIn: number;
  /** Portée gaussienne des projections excitatrices, en mailles de la dalle. */
  sigmaExc: number;
  /** Portée des projections inhibitrices ; > sigmaExc (profil « mexican hat »). */
  sigmaInh: number;
  /** Fraction d'inhibiteurs corticaux (loi de Dale). */
  fracInh: number;
  /** Délai axonal maximal, en ticks (>= 1). */
  delayMax: number;
  wExc: number;
  /**
   * Poids des afférences capteur → cortex. DISTINCT de wExc : peu nombreuses, elles doivent
   * être fortes pour imposer le signal à un cortex dominé par sa récurrence inhibitrice —
   * comme les afférences thalamo-corticales. À wExc, la mesure montre que le cortex ignore
   * ses capteurs (moyenne 0,0104 → 0,0111 pour une entrée multipliée par 15).
   */
  wSensory: number;
  /** Valeur POSITIVE ; le signe négatif est appliqué à la construction. */
  wInh: number;
  /** Borne supérieure du module d'un poids. */
  wMax: number;
}

export const TOPOLOGIE_DEFAUT: TopologyParams = {
  n: 50_000,
  seed: 1,
  kCortex: 64,
  kSensory: 24,
  kMotorIn: 48,
  sigmaExc: 2.2,
  sigmaInh: 4.4,
  fracInh: 0.2,
  delayMax: 8,
  wExc: 0.09,
  wSensory: 0.4,
  wInh: 1.4,
  wMax: 3.0,
};

// ─── Neurone LIF ────────────────────────────────────────────────────────────────────────

export interface LifParams {
  /** Constante de fuite membranaire, en ticks. */
  tauM: number;
  /** Fuite du courant synaptique, en ticks. */
  tauS: number;
  /** Retour du seuil vers thrBase, en ticks. */
  tauThr: number;
  vRest: number;
  vReset: number;
  thrBase: number;
  /** Saut de seuil après décharge : le frein qui empêche un neurone de monopoliser l'activité. */
  thrJump: number;
  /** Ticks de réfractaire. */
  refrac: number;
  /** Écart-type du bruit de courant, par tick. */
  noise: number;
}

export const LIF_DEFAUT: LifParams = {
  tauM: 20,
  tauS: 5,
  tauThr: 120,
  vRest: 0,
  vReset: 0,
  thrBase: 1,
  thrJump: 0.18,
  refrac: 3,
  noise: 0.08,
};

// ─── Régime calibré ─────────────────────────────────────────────────────────────────────
//
// MESURÉ le 2026-07-30 (voir docs/superpowers/notes/2026-07-30-vie-calibration.md), pas
// choisi. Le réseau par défaut était net-excitateur et saturait à 0,078 décharge/neurone/tick ;
// wInh porté à 1,4 le rend net-inhibiteur, et noise à 0,08 lui donne une activité spontanée
// que l'entrée sensorielle peut moduler. Sans cette modulabilité, les capteurs n'auraient
// aucune prise sur un cortex déjà saturé.

/** Taux du régime ENTRETENU, en décharges par neurone et par tick. Cible de l'homéostasie. */
export const TAUX_CIBLE = 0.022;

/** Courant de fond retenu à la calibration. Réutilisé par les sondes. */
export const DRIVE_CALIBRE = 1.0;

/** Taux SPONTANÉ mesuré (sans aucune entrée) — repère, pas une cible. */
export const TAUX_SPONTANE = 0.009;
