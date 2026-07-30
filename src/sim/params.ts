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

// ─── Plasticité à trois facteurs ────────────────────────────────────────────────────────

export interface PlasticityParams {
  /** Décroissance des traces de décharge, en ticks. */
  tauPre: number;
  tauPost: number;
  /** Décroissance de l'éligibilité, en ticks : la fenêtre de crédit temporel. */
  tauElig: number;
  /** Amplitude de la potentialisation (pré avant post). */
  aPlus: number;
  /** Amplitude de la dépression (post avant pré). */
  aMinus: number;
  /** Taux d'apprentissage. 0 = témoin gelé. */
  lr: number;
  /** Cadence du déversement dopaminergique, en ticks. */
  dumpEvery: number;
  /** |dopamine accumulée| au-delà de laquelle on déverse sans attendre la cadence. */
  dumpNow: number;
  /** Cadence de l'homéostasie, en ticks. */
  homeoEvery: number;
  /** Vigueur de la mise à l'échelle homéostatique. */
  homeoRate: number;
  /** Borne du facteur multiplicatif par passage (0,05 → [0,95 ; 1,05]). */
  homeoClamp: number;
  /** Doit valoir TopologyParams.wMax ; createBrain le vérifie. */
  wMax: number;
}

export const PLASTICITE_DEFAUT: PlasticityParams = {
  tauPre: 20,
  tauPost: 20,
  tauElig: 60,
  aPlus: 0.012,
  // Légèrement inférieur à aPlus : le choix standard qui évite la dérive vers zéro d'un
  // réseau à activité irrégulière.
  aMinus: 0.0105,
  lr: 0.05,
  dumpEvery: 16,
  dumpNow: 0.6,
  homeoEvery: 500,
  homeoRate: 0.15,
  homeoClamp: 0.05,
  wMax: 3.0,
};

/**
 * Cible de l'homéostasie, en décharges par neurone et par tick.
 *
 * DISTINCT de TAUX_CIBLE (le régime entretenu) : l'homéostasie doit viser la moyenne
 * réellement vécue par un neurone, pas le pic sous stimulation. Viser le régime entretenu
 * potentialiserait sans fin les territoires momentanément silencieux, jusqu'à les faire
 * décharger sans entrée. Valeur provisoire entre spontané (0,009) et entretenu (0,022) ;
 * la tâche 7 la corrigera en mesurant le taux cortical réellement vécu par l'organisme.
 */
export const TAUX_HOMEO = 0.012;

// ─── Le monde et l'enjeu ────────────────────────────────────────────────────────────────
//
// Un pas de monde = un tick de cerveau. L'organisme ne peut pas mettre le temps en pause en
// hésitant : c'est ce qui rend l'hésitation coûteuse, donc ce qui donne un sens à la course
// au seuil du décodage moteur.

export interface WorldParams {
  /** Demi-côté de l'arène carrée. */
  arena: number;
  nFood: number;
  nToxin: number;
  /** Rayon d'absorption d'une pastille. */
  foodRadius: number;
  energyMax: number;
  energyStart: number;
  gainFood: number;
  lossToxin: number;
  lossPredator: number;
  rFood: number;
  rToxin: number;
  rPredator: number;
  /** Coût métabolique par tick, au repos et en déplacement. */
  metabRest: number;
  metabMove: number;
  stepLen: number;
  /** Rotation par action, en radians. */
  turnStep: number;
  predatorSpeed: number;
  /** Distance en deçà de laquelle le prédateur poursuit. */
  predatorSense: number;
  predatorContact: number;
  /** Portée de l'émission ALARM. Bien plus grande que le contact : la fuite est apprenable. */
  alarmRange: number;
  olfRange: number;
  /** Ticks avant réapparition d'une pastille consommée. */
  respawnEvery: number;
}

export const MONDE_DEFAUT: WorldParams = {
  arena: 120,
  nFood: 14,
  nToxin: 14,
  foodRadius: 5,
  energyMax: 100,
  energyStart: 60,
  gainFood: 22,
  lossToxin: 30,
  lossPredator: 45,
  rFood: 1,
  rToxin: -1.4,
  rPredator: -2,
  metabRest: 0.05,
  metabMove: 0.18,
  stepLen: 1.4,
  turnStep: 0.22,
  predatorSpeed: 0.9,
  predatorSense: 55,
  predatorContact: 6,
  alarmRange: 90,
  olfRange: 70,
  respawnEvery: 240,
};

// ─── Cerveau : encodage sensoriel et décision ───────────────────────────────────────────

export interface BrainParams {
  topology: TopologyParams;
  lif: LifParams;
  plasticity: PlasticityParams;
  /** Conversion intensité perçue [0,1] → courant injecté dans le pool sensoriel. */
  injectGain: number;
  /** Fuite de l'accumulateur moteur, par tick. */
  accLeak: number;
  /** Conversion de la fraction du pool ayant déchargé → preuve accumulée. */
  accGain: number;
  /** Seuil de décision : le premier pool à le franchir gagne. */
  accSeuil: number;
  /** Ticks au-delà desquels une action par défaut est forcée. */
  accTimeout: number;
  accDefault: MotorAction;
}

export const CERVEAU_DEFAUT: BrainParams = {
  topology: TOPOLOGIE_DEFAUT,
  lif: LIF_DEFAUT,
  plasticity: PLASTICITE_DEFAUT,
  injectGain: 0.35,
  accLeak: 0.06,
  accGain: 1.0,
  accSeuil: 2.5,
  accTimeout: 60,
  accDefault: "AVANCER",
};
