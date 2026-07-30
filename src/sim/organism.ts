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
import { createWorld, sense, stepWorld, type WorldEventKind, type WorldState } from "./world";
import { TAUX_HOMEO, type MotorAction, type OrganismParams } from "./params";

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
  /** Décharges corticales cumulées, pour mesurer le taux réellement vécu. */
  corticalSpikes: number;
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
  return {
    brain,
    world: createWorld(p.world, mulberry32(p.worldSeed)),
    metrics: createMetrics(),
    params: p,
    options,
    rBar: 0,
    lastAction: null,
    daLog: [],
    corticalSpikes: 0,
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
  // Les paramètres EFFECTIFS du cerveau, pas ceux d'origine : `options.lr` a pu les
  // remplacer, et le témoin gelé en dépend entièrement.
  const plast = org.brain.params.plasticity;
  addDopamine(org.brain.topo, org.brain.lif, org.brain.plast, plast, da);

  if (org.brain.lif.t % plast.homeoEvery === 0) {
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
  org.corticalSpikes += org.brain.lif.spikeCount;

  return { action, reward: pas.reward };
}

export function runOrganism(org: Organism, ticks: number, rng: RNG): void {
  for (let k = 0; k < ticks; k++) stepOrganism(org, rng);
}
