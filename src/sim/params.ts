// Types et valeurs par défaut partagés par tout le noyau « Vie ».
//
// LA SECONDE EST L'UNITÉ DE TEMPS, le tick n'en est que la résolution. Les constantes
// temporelles (τm, τs, τthr, τe, délais axonaux) sont écrites en secondes dans `temps.ts` et
// RÉSOLUES ici à l'horloge de référence dt = 1 ms. Les valeurs ci-dessous ne s'écrivent donc
// plus à la main.
//
// POURQUOI CE RENVERSEMENT (lot 0, 2026-07-30) : tant que les constantes étaient écrites en
// ticks, rien ne disait ce qu'un tick valait, et leur incohérence MUTUELLE restait invisible.
// C'est ainsi que `tauElig / tauM` a pu valoir 3 pendant tout le lot 1, contre 50 à 1 000 en
// biologie — une fenêtre de crédit environ 50 fois trop courte, jamais détectée faute d'unité
// de référence. Voir l'entête de `temps.ts`.
//
// Un « taux de décharge » reste exprimé en décharges par neurone et par TICK : c'est une mesure
// du modèle, pas une constante de la biologie.

import {
  DT_DEFAUT,
  LIF_SECONDES,
  PLASTICITE_SECONDES,
  resoudreDelaiMax,
  resoudreLif,
  resoudrePlasticite,
} from "./temps";

// ─── Régions ────────────────────────────────────────────────────────────────────────────

export type RegionId =
  | "OLF_FOOD"
  | "OLF_TOXIN"
  | "ALARM"
  | "SOMA"
  | "INTERO"
  | "CORTEX"
  | "MOTOR"
  | "VTA"
  // Voie olfactive (lot 1 de la refonte) — noms de structures, pas d'animal.
  | "GLOM"
  | "KC"
  | "APL"
  | "GUST"
  | "MBON";

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
  // Dérivé de DELAI_MAX_SECONDES (8 ms) : 8 ticks à l'horloge de référence.
  delayMax: resoudreDelaiMax(DT_DEFAUT).delayMax,
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

/**
 * Le neurone à l'horloge de référence (dt = 1 ms). DÉRIVÉ de `LIF_SECONDES` : modifier une
 * constante de temps se fait là-bas, en secondes, jamais ici en ticks.
 *
 * Les valeurs obtenues sont identiques au noyau d'avant le lot 0 — tauM 20, tauS 5, tauThr 120,
 * refrac 3 — et `temps.test.ts` les épingle en entiers littéraux.
 */
export const LIF_DEFAUT: LifParams = resoudreLif(LIF_SECONDES, DT_DEFAUT).params;

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

/**
 * La plasticité à l'horloge de référence (dt = 1 ms). DÉRIVÉE de `PLASTICITE_SECONDES`.
 *
 * DEUX valeurs changent par rapport au noyau d'avant le lot 0, et ce sont LE changement de fond :
 *   - `tauElig` : 60 → 2 500 ticks (2,5 s). La fenêtre de crédit était ~50× trop courte ;
 *   - `dumpEvery` : 16 → 250 ticks (250 ms), soit un dixième de la fenêtre — 16 ticks serait
 *     absurdement fréquent face à 2 500, et le balayage dopaminergique coûtait 17 % du temps.
 * Les autres sont inchangées : tauPre/tauPost 20, homeoEvery 500.
 */
export const PLASTICITE_DEFAUT: PlasticityParams = resoudrePlasticite(
  PLASTICITE_SECONDES,
  DT_DEFAUT,
).params;

/**
 * Cible de l'homéostasie, en décharges par neurone et par tick.
 *
 * DISTINCT de TAUX_CIBLE (le régime entretenu) : l'homéostasie doit viser la moyenne
 * réellement vécue par un neurone, pas le pic sous stimulation. Viser le régime entretenu
 * potentialiserait sans fin les territoires momentanément silencieux, jusqu'à les faire
 * décharger sans entrée — l'organisme finirait par halluciner ses capteurs.
 *
 * Valeur MESURÉE : taux cortical de l'organisme dans son monde, 0,0146 / 0,0149 / 0,0145 sur
 * trois graines (sonde organism.probe).
 */
export const TAUX_HOMEO = 0.0146;

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
  /**
   * Rotation par action, sous forme de cosinus et sinus PRÉCALCULÉS — et non d'un angle.
   *
   * `Math.cos` et `Math.sin` ne sont pas spécifiés au bit près par ECMAScript. Mesuré le
   * 2026-07-30 en exécutant le même bundle sous V8 et sous JSC : le réseau reste bit-identique
   * à n = 50 000 sur 400 000 ticks, mais l'organisme divergeait dès le tick ≈ 17 942 — parce
   * que ces fonctions alimentaient, ici, des comparaisons de seuil et des index de secteur
   * ENTIERS, que rien ne rattrape.
   *
   * Le cap est donc un VECTEUR UNITAIRE, tourné par cette paire. Une rotation n'utilise que
   * des multiplications et des additions, exactement spécifiées.
   *
   * Valeurs de 0,06 rad, l'angle mesuré à la tâche 7 du lot 1.
   */
  turnCos: number;
  turnSin: number;
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
  arena: 80,
  nFood: 20,
  nToxin: 20,
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
  metabMove: 0.1,
  stepLen: 1.4,
  // cos(0,06) et sin(0,06), calculés une fois et inscrits en littéraux.
  turnCos: 0.99820053993520419,
  turnSin: 0.059964006479444595,
  predatorSpeed: 0.9,
  predatorSense: 35,
  predatorContact: 6,
  alarmRange: 60,
  olfRange: 55,
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
  accSeuil: 0.3,
  accTimeout: 60,
  accDefault: "AVANCER",
};

// ─── L'organisme ────────────────────────────────────────────────────────────────────────

export interface OrganismParams {
  brain: BrainParams;
  world: WorldParams;
  /** Constante de la moyenne glissante rBar, en ticks. */
  tauReward: number;
  /** Graine du placement des pastilles et du prédateur, distincte de celle du cerveau. */
  worldSeed: number;
}

export const ORGANISME_DEFAUT: OrganismParams = {
  brain: CERVEAU_DEFAUT,
  world: MONDE_DEFAUT,
  tauReward: 400,
  worldSeed: 12345,
};

// ─── La voie olfactive (lot 1 de la refonte) ────────────────────────────────────────────
//
// Glomérules → cellules de Kenyon → neurone de sortie, plus la rétroaction APL qui impose
// la sparsité DANS le tick (remplace l'homéostasie, §5.5 de la spec) et la voie gustative
// qui porte le stimulus inconditionné et le réflexe inné. Pas de récurrence : la couche
// plastique (KC → sortie) est en aval, la stabilité est structurelle.
//
// STATUT des effectifs : chaque valeur porte son statut dans le commentaire. « inventé »
// est assumé ; « réduit » signifie ramené à l'échelle du banc depuis un chiffre publié.

export interface VoieParams {
  /** Taille totale visée. */
  n: number;
  seed: number;
  /** Glomérules. Publié ≈ 160 ; réduit au banc. */
  nGlom: number;
  /** Neurones de projection par glomérule. Publié ≈ 5–6 ; réduit au banc. */
  pnParGlom: number;
  /** Neurones de sortie (MBON). Publié ≈ 400 ; 1 suffit pour le réflexe harnaché. */
  nMBON: number;
  /** Afférences gustatives (voie du stimulus inconditionné). Inventé. */
  nGust: number;
  /** Glomérules échantillonnés par cellule de Kenyon. Publié ≈ 5–10 (drosophile). */
  kAff: number;
  /** Neurones de sortie contactés par cellule de Kenyon. INVENTÉ (spec §11, ouvert). */
  kOut: number;
  /**
   * Gain de la boucle APL : règle la sparsité du code des cellules de Kenyon de façon
   * monotone (mesuré §5.5 : gain 8 → ≈ 4 %). BORNÉ : l'alternance n'apparaît qu'à ≈ 12× le
   * gain utile (mesuré) — ne pas dépasser 50.
   */
  gainAPL: number;
  /** Poids fixe glomérule → cellule de Kenyon. À calibrer (régime). */
  wGK: number;
  /** Poids fixe cellule de Kenyon → APL. À calibrer (régime). */
  wKA: number;
  /** Poids initial KC → MBON, la couche plastique. À calibrer (taux spontané). */
  w0: number;
  /** Poids fixe gustatif → MBON : le réflexe inconditionnel, inné et fort. À calibrer. */
  wGust: number;
  /** Délai axonal maximal, en ticks. */
  delayMax: number;
  wMax: number;
}

export const VOIE_DEFAUT: VoieParams = {
  n: 2_500,
  seed: 1,
  // MESURÉ (rang 2) : le compte publié est ~160 glomérules — il donne une résolution
  // de distance au glomérule (32 actifs à densité 0,2), indispensable pour le
  // gradient de généralisation.
  nGlom: 160,
  pnParGlom: 2,
  nMBON: 1,
  nGust: 8,
  kAff: 10,
  kOut: 20,
  // MESURÉ : à wGK 0,05 / densité 0,2 / gainAPL 30, ≈ 2,5 % des KC répondent à une
  // odeur (cible publiée ~4–7 %, le nôtre un peu plus épars) et la sortie naïve reste
  // basse sans s'éteindre.
  gainAPL: 30,
  wGK: 0.05,
  wKA: 0.05,
  // MESURÉ : à 0,05 la sortie sature sous odeur naïve (le contrôle UR devenait
  // indiscernable du niveau spontané) ; à 0,003 la réponse naïve reste basse et la
  // potentialisation a toute la marge jusqu'à wMax.
  w0: 0.003,
  wGust: 0.9,
  delayMax: resoudreDelaiMax(DT_DEFAUT).delayMax,
  wMax: 3.0,
};
