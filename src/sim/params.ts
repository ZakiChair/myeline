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
  wInh: 0.28,
  wMax: 1.5,
};
