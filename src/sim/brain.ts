// Le cerveau : assemblage topologie + LIF + plasticité, encodage des capteurs, décodage
// moteur par course au seuil. Ne connaît pas le monde — il reçoit une Sensation et rend une
// MotorAction.
//
// La décision n'est PAS un argmax. Chaque pool moteur intègre son propre taux de décharge ;
// le premier à franchir le seuil gagne. On voit donc la preuve s'accumuler puis basculer :
// c'est là que se lit l'instant du choix, qu'un argmax cacherait.

import type { RNG } from "../lib/rng";
import { accumulateEligibility } from "./plasticity";
import { createPlasticity, type PlasticityState } from "./plasticity";
import { createLif, stepLif, type LifState } from "./lif";
import { buildTopology, poolRange, regionById, type Topology } from "./topology";
import { ACTIONS, type BrainParams, type MotorAction, type RegionId, type Sensation } from "./params";
import { SECTEURS_ALARM, SECTEURS_OLF, SECTEURS_SOMA } from "./world";

export interface Brain {
  topo: Topology;
  lif: LifState;
  plast: PlasticityState;
  params: BrainParams;
  /** [4] accumulateurs de preuve, un par pool moteur. */
  acc: Float32Array;
  ticksSinceDecision: number;
  lastDecision: MotorAction | null;
}

/** Correspondance modalité → région, vérifiée à la construction. */
const CANAUX: ReadonlyArray<{ id: RegionId; secteurs: number }> = [
  { id: "OLF_FOOD", secteurs: SECTEURS_OLF },
  { id: "OLF_TOXIN", secteurs: SECTEURS_OLF },
  { id: "ALARM", secteurs: SECTEURS_ALARM },
  { id: "SOMA", secteurs: SECTEURS_SOMA },
];

export function createBrain(p: BrainParams): Brain {
  if (p.plasticity.wMax !== p.topology.wMax) {
    throw new Error(
      `wMax incohérent : topologie ${p.topology.wMax} vs plasticité ${p.plasticity.wMax}`,
    );
  }
  const topo = buildTopology(p.topology);
  for (const c of CANAUX) {
    const r = regionById(topo, c.id);
    if (r.pools !== c.secteurs) {
      throw new Error(`${c.id} a ${r.pools} pools, le monde en émet ${c.secteurs}`);
    }
  }
  if (regionById(topo, "MOTOR").pools !== ACTIONS.length) {
    throw new Error("le nombre de pools moteurs doit égaler le nombre d'actions");
  }
  return {
    topo,
    lif: createLif(topo, p.lif),
    plast: createPlasticity(topo, p.plasticity),
    params: p,
    acc: new Float32Array(ACTIONS.length),
    ticksSinceDecision: 0,
    lastDecision: null,
  };
}

/** Injecte `valeur` dans tous les neurones d'un pool. */
function injecterPool(brain: Brain, id: RegionId, pool: number, valeur: number): void {
  if (valeur <= 0) return;
  const { start, end } = poolRange(regionById(brain.topo, id), pool);
  for (let i = start; i < end; i++) brain.lif.inject[i] = valeur;
}

/**
 * Convertit une sensation en courants injectés dans les régions sensorielles.
 *
 * Codage par population : l'intensité perçue dans le secteur module le courant du pool
 * correspondant, sans seuil binaire. Aucune injection dans le cortex ni dans les pools
 * moteurs — le comportement doit traverser le cortex, sinon une lésion corticale ne
 * prouverait rien.
 */
export function encodeSensation(brain: Brain, s: Sensation): void {
  const g = brain.params.injectGain;
  const canaux: Array<[RegionId, Float32Array]> = [
    ["OLF_FOOD", s.food],
    ["OLF_TOXIN", s.toxin],
    ["ALARM", s.alarm],
    ["SOMA", s.soma],
  ];
  for (const [id, valeurs] of canaux) {
    for (let b = 0; b < valeurs.length; b++) injecterPool(brain, id, b, g * valeurs[b]);
  }

  // Intéroception : pic de population glissant. L'organisme SENT sa faim, donc la faim peut
  // moduler la décision.
  const inter = regionById(brain.topo, "INTERO");
  const pic = Math.round(Math.max(0, Math.min(1, s.energy)) * (inter.pools - 1));
  injecterPool(brain, "INTERO", pic, g);
  if (pic > 0) injecterPool(brain, "INTERO", pic - 1, g * 0.5);
  if (pic < inter.pools - 1) injecterPool(brain, "INTERO", pic + 1, g * 0.5);
}

/**
 * Un tick de cerveau : activité, éligibilité, accumulateurs moteurs. Renvoie l'action si une
 * décision est tombée, sinon null.
 *
 * Ni dopamine ni homéostasie ici : elles dépendent du monde, donc c'est `organism.ts` qui
 * les pilote.
 */
export function stepBrain(brain: Brain, rng: RNG): MotorAction | null {
  const p = brain.params;
  stepLif(brain.topo, brain.lif, p.lif, rng);
  accumulateEligibility(brain.topo, brain.lif, brain.plast, p.plasticity);

  const mot = regionById(brain.topo, "MOTOR");
  const taille = mot.poolSize;
  for (let k = 0; k < ACTIONS.length; k++) {
    const { start, end } = poolRange(mot, k);
    let n = 0;
    for (let i = start; i < end; i++) n += brain.lif.fired[i];
    const v = brain.acc[k] * (1 - p.accLeak) + (p.accGain * n) / taille;
    brain.acc[k] = v > 0 ? v : 0;
  }

  brain.ticksSinceDecision++;

  let gagnant = -1;
  for (let k = 0; k < ACTIONS.length; k++) {
    if (brain.acc[k] >= p.accSeuil) {
      gagnant = k;
      break; // égalité départagée par l'indice le plus petit
    }
  }
  if (gagnant < 0 && brain.ticksSinceDecision >= p.accTimeout) {
    gagnant = ACTIONS.indexOf(p.accDefault);
  }
  if (gagnant < 0) return null;

  brain.acc.fill(0);
  brain.ticksSinceDecision = 0;
  brain.lastDecision = ACTIONS[gagnant];
  return brain.lastDecision;
}

/** État des accumulateurs, pour l'affichage du lot 2. */
export function motorAccumulators(brain: Brain): Float32Array {
  return brain.acc;
}
