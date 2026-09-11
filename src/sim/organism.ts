// L'organisme : la boucle fermée sentir → cerveau → décider → agir → doper.
//
// TROIS COUTURES sont posées ici pour les protocoles du lot 3. Elles sont des décisions
// d'interface, pas des fonctionnalités anticipées : sans elles, les protocoles exigeraient
// de la chirurgie dans ce fichier.
//
//   1. `dopamineSource` — la dopamine n'est jamais calculée en dur. Le témoin *yoked*
//      (protocole 3) fournit une fonction qui rejoue le calendrier d'un autre agent.
//   2. `onEvent` — le journal porte les décharges du tick, pour que le protocole de lésion
//      (protocole 4) construise lui-même sa corrélation activité ↔ toxine.
//   3. `lesion` — un masque de neurones éteints, lu par stepLif.
//
// Le témoin *gelé* (protocole 2) n'a besoin de rien de plus : `lr: 0`.

import { mulberry32, type RNG } from "../lib/rng";
import { createBrain, encodeSensation, stepBrain, type Brain } from "./brain";
import { addDopamine, homeostasis } from "./plasticity";
import { createMetrics, recordEvent, recordTick, type Metrics } from "./metrics";
import { createWorld, sense, stepWorld, SECTEURS_OLF, type WorldEventKind, type WorldState } from "./world";
import { ACTIONS, TAUX_HOMEO, type MotorAction, type OrganismParams } from "./params";
import { createVoie, dechargesSer, dechargesSortie, injecterOdeur, stepVoie, type Voie } from "./voie";
import { actifs, declinerN, genererOdeur, type Odeur } from "./tasks/odors";

export interface DopamineContext {
  reward: number;
  /** Moyenne glissante des récompenses : la dopamine est une erreur de PRÉDICTION. */
  rBar: number;
  t: number;
  event: WorldEventKind | null;
}

export interface OrganismEvent {
  t: number;
  kind: WorldEventKind;
  reward: number;
  /** Neurones ayant déchargé à ce tick. Vue vivante : à copier pour la conserver. */
  spikes: Int32Array;
  spikeCount: number;
}

export interface OrganismOptions {
  /** 0 pour le témoin gelé. Défaut : la valeur des paramètres de plasticité. */
  lr?: number;
  /** Défaut : (ctx) => ctx.reward - ctx.rBar. */
  dopamineSource?: (ctx: DopamineContext) => number;
  onEvent?: (ev: OrganismEvent) => void;
  /** Masque de neurones éteints (protocole 4). */
  lesion?: Uint8Array | null;
  /**
   * Coupe la mise à l'échelle homéostatique. Défaut : true (active), donc rétro-compatible.
   *
   * DEUX TÉMOINS DISTINCTS, que le lot 1 confondait :
   *   - gelé-APPRENTISSAGE : lr = 0, homeostasis = true  → isole la règle à trois facteurs ;
   *   - gelé-TOTAL         : lr = 0, homeostasis = false → aucun poids ne bouge.
   *
   * Mesuré le 2026-07-30 : l'homéostasie produit 93 à 96 % du mouvement synaptique. Appeler
   * « gelé » le premier laissait croire au second, ce qui privait la comparaison de son sens.
   * On ne conditionne PAS l'homéostasie par `lr` : cela ferait du témoin un modèle différent
   * (sans mécanisme de stabilité) au lieu du même modèle sans apprentissage.
   */
  homeostasis?: boolean;
}

export interface Organism {
  brain: Brain;
  world: WorldState;
  metrics: Metrics;
  params: OrganismParams;
  options: OrganismOptions;
  rBar: number;
  lastAction: MotorAction | null;
  /** Calendrier de dopamine émis — sert de source au témoin yoked. */
  daLog: number[];
  /** Module olfactif (rang 5) — null si `params.voie` absent ou inactif. */
  voie: Voie | null;
  /** L'odeur portée par le canal nourriture (le CS appétitif possible). */
  odeurFood: Odeur | null;
  /** L'odeur portée par le canal toxine (le CS aversif possible). */
  odeurToxin: Odeur | null;
  /** Impulsion de renforcement appétitif (OA) à émettre — posée par un événement FOOD. */
  usOa: number;
  /** Impulsion de renforcement aversif (DA) à émettre — posée par un événement TOXIN. */
  usDa: number;
  /** Intensité olfactive dominante par canal au tick courant (0 = rien). */
  sensF: number;
  sensT: number;
  /** Odeur injectée ce tick : 0 = rien, 1 = nourriture dominante, 2 = toxine. */
  odeurCourante: number;
}

export function createOrganism(p: OrganismParams, options: OrganismOptions = {}): Organism {
  const brainParams =
    options.lr === undefined
      ? p.brain
      : { ...p.brain, plasticity: { ...p.brain.plasticity, lr: options.lr } };
  const brain = createBrain(brainParams);
  if (options.lesion) {
    if (options.lesion.length !== brain.topo.n) {
      throw new Error(`masque de lésion de taille ${options.lesion.length}, attendu ${brain.topo.n}`);
    }
    brain.lif.silenced = options.lesion;
  }
  // Le module olfactif, si la configuration le demande. Les deux odeurs du monde sont
  // tirées d'une graine dédiée — mêmes graines ⇒ mêmes codes, l'arbitraire est partagé.
  let voie: Voie | null = null;
  let odeurFood: Odeur | null = null;
  let odeurToxin: Odeur | null = null;
  if (p.voie?.actif) {
    voie = createVoie(p.voie.voie, p.voie.lif, p.voie.plast);
    const rngOdeurs = mulberry32(p.voie.voie.seed ^ 0x0d0e);
    odeurFood = genererOdeur(rngOdeurs, p.voie.voie.nGlom, "food");
    // Toxine = complément disjoint du code nourriture : deux tirages libres
    // partageraient ~6 glomérules actifs — leurs KC communes se feraient marquer
    // sous les deux étiquettes et la sortie apprise ne serait pas sélective
    // (mesuré : SER répondait autant à la nourriture).
    odeurToxin = declinerN(rngOdeurs, odeurFood, actifs(odeurFood).length, "toxin");
  }
  return {
    brain,
    world: createWorld(p.world, mulberry32(p.worldSeed)),
    metrics: createMetrics(),
    params: p,
    options,
    rBar: 0,
    lastAction: null,
    daLog: [],
    voie,
    odeurFood,
    odeurToxin,
    usOa: 0,
    usDa: 0,
    sensF: 0,
    sensT: 0,
    odeurCourante: 0,
  };
}

/**
 * Un tick complet. Le monde avance TOUJOURS, même sans décision : l'organisme ne peut pas
 * mettre le temps en pause en hésitant. C'est ce qui donne son coût à l'hésitation, donc son
 * sens à la course au seuil.
 */
export function stepOrganism(org: Organism, rng: RNG): { action: MotorAction | null; reward: number } {
  const p = org.params;
  const s = sense(org.world, p.world);
  encodeSensation(org.brain, s);
  if (org.voie) {
    // Compétition à l'antenne : seule l'odeur DOMINANTE est injectée — le CS est
    // l'odeur la plus proche, celle qui causera l'événement (à distance < rayon de
    // contact, l'intensité vaut ~0,9 : la pastille touchée gagne toujours). Mesuré
    // sans cette porte : les deux codes restent marqués en permanence dans le pool
    // d'éligibilité et chaque consolidation crédite les deux — MBON et SER se
    // potentialisent pour les deux odeurs, la sélectivité meurt.
    let gF = 0;
    for (const x of s.food) if (x > gF) gF = x;
    let gT = 0;
    for (const x of s.toxin) if (x > gT) gT = x;
    const g0 = p.voie!.injectOdeur;
    org.sensF = gF;
    org.sensT = gT;
    if (gF > gT) injecterOdeur(org.voie, org.odeurFood!.intensites, g0 * gF);
    else if (gT > 0) injecterOdeur(org.voie, org.odeurToxin!.intensites, g0 * gT);
    // L'odeur sous laquelle les écritures d'éligibilité du tick seront étiquetées.
    org.odeurCourante = gF > gT ? 1 : gT > 0 ? 2 : 0;
  }

  // L'action décidée PERSISTE jusqu'à la décision suivante : on décide « avancer », et on
  // avance jusqu'à changer d'avis. Sans cela, l'organisme n'agirait qu'au tick de la décision
  // et resterait immobile les dizaines de ticks d'accumulation suivants — mesuré à 3,4 % du
  // temps en mouvement, soit une incapacité structurelle à rencontrer quoi que ce soit.
  const action = stepBrain(org.brain, rng);
  if (action !== null) org.lastAction = action;
  const pas = stepWorld(org.world, p.world, org.lastAction ?? "STOP", rng);

  org.rBar += (pas.reward - org.rBar) / p.tauReward;

  const ctx: DopamineContext = {
    reward: pas.reward,
    rBar: org.rBar,
    t: org.brain.lif.t,
    event: pas.event,
  };
  const da = org.options.dopamineSource ? org.options.dopamineSource(ctx) : pas.reward - org.rBar;
  org.daLog.push(da);

  if (org.voie) {
    // Chaque événement du monde renforce SON canal par une IMPULSION unique au
    // tick du contact — pas une fenêtre continue (la fenêtre laissait les marques
    // de l'autre odeur se réécrire pendant la consolidation : la sélectivité
    // d'odeur mourait). FOOD → OA, TOXIN → DA.
    if (pas.event === "FOOD") org.usOa = p.voie!.oaDose;
    // TOXIN seul — PAS PREDATOR : son CS est le canal ALARM, pas une odeur. À
    // chaque coup, l'odeur dominante du moment (souvent la nourriture, dont
    // l'organisme reste proche) se consolidait sur le canal aversif — mesuré :
    // le SER apprenait « nourriture → danger », la mauvaise association.
    if (pas.event === "TOXIN") org.usDa = p.voie!.daDose;
    // Un événement ne consolide que les marques écrites sous SON odeur
    // (portée d'odeur dans addModulateurs).
    const odeurUS = pas.event === "FOOD" ? 1 : pas.event === "TOXIN" ? 2 : 0;
    stepVoie(org.voie, rng, org.usOa, org.usDa, org.odeurCourante, odeurUS);
    org.usOa = 0;
    org.usDa = 0;

    // Les sorties du module PILOTENT la direction, pas seulement la marche : le
    // contact devient une conséquence de l'odeur — c'est ce qui rend les marques
    // au contact causales (mesuré : sans guidage, l'aversif apprenait l'odeur
    // statistiquement dominante, pas la coupable).
    const mbon = dechargesSortie(org.voie);
    const ser = dechargesSer(org.voie);
    if (mbon > 0 || ser > 0) {
      // Direction de l'odeur dominante : le secteur de plus forte intensité, en
      // coordonnée latérale — cy > 0 = à gauche du cap.
      const canal = org.sensF > org.sensT ? s.food : s.toxin;
      let k = 0;
      for (let b = 1; b < SECTEURS_OLF; b++) if (canal[b] > canal[k]) k = b;
      const gauche = k > 0 && k <= SECTEURS_OLF / 2; // secteurs 1..12 = à gauche
      const iG = ACTIONS.indexOf("GAUCHE");
      const iD = ACTIONS.indexOf("DROITE");
      org.brain.acc[ACTIONS.indexOf("AVANCER")] += p.voie!.gainApproche * mbon;
      org.brain.acc[gauche ? iG : iD] += p.voie!.gainDir * mbon;
      org.brain.acc[gauche ? iD : iG] += p.voie!.gainEvite * ser;
    }
  }
  // Les paramètres EFFECTIFS du cerveau, pas ceux d'origine : `options.lr` a pu les
  // remplacer, et le témoin gelé en dépend entièrement.
  const plast = org.brain.params.plasticity;
  addDopamine(org.brain.topo, org.brain.lif, org.brain.plast, plast, da);

  if (org.options.homeostasis !== false && org.brain.lif.t % plast.homeoEvery === 0) {
    homeostasis(org.brain.topo, org.brain.lif, org.brain.plast, plast, TAUX_HOMEO);
  }

  if (pas.event !== null) {
    org.options.onEvent?.({
      t: org.brain.lif.t,
      kind: pas.event,
      reward: pas.reward,
      spikes: org.brain.lif.spikes,
      spikeCount: org.brain.lif.spikeCount,
    });
    recordEvent(org.metrics, pas.event, org.world.lastLifetime);
  }
  recordTick(org.metrics, org.world.energy, pas.reward);

  return { action, reward: pas.reward };
}

export function runOrganism(org: Organism, ticks: number, rng: RNG): void {
  for (let k = 0; k < ticks; k++) stepOrganism(org, rng);
}
