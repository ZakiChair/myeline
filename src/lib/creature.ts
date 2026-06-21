// Créature de Braitenberg APPRISE — boucle sensori-motrice minimale (v1).
//
// Transposition FIDÈLE du gate prouvé (creature-gate.probe.test.ts) : graphe FIGÉ,
// décision softmax calculée HORS-réseau sur les poids appris, action FORCÉE co-active
// avec le cue, crédit reward-Hebb au MÊME TICK. Le mur du substrat (assignation de
// crédit multi-tick, cf. creature-sep / causal-chain) est évité parce qu'UN essai = UN
// tick : sense + act + credit sont collapsés. Le déplacement dans le monde (increments
// suivants) est une ANIMATION découplée de ce tick — il ne réinjecte jamais de reward différé.
//
// Non-négociables (sinon la voie apprise s'effondre) : hebbian=false (sinon Hebb érode),
// spontaneous=0 (déterminisme + pas de décharge parasite), fireFraction=0.4, graphe figé
// (stepScale develop=false), codage binaire, rng gainé. UN cue, UNE contingence.

import {
  scaleGraphFromEdges,
  stepScale,
  weightBetween,
  type ScaleGraph,
} from "./scale-engine";
import { applyInput } from "./io";
import { mulberry32, type RNG } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimParams } from "./types";

// Slots réservés fixes (indices stables dans le graphe figé à 14 nœuds).
export const SENS = [0, 1]; // capteurs : pastille présente dans le champ
export const MOT_B = [2, 3]; // pool moteur « approcher » (action correcte)
export const MOT_C = [4, 5]; // pool moteur « mauvaise direction » (incorrecte)
export const HIDDEN = [6, 7, 8, 9, 10, 11, 12, 13];

export const W_CAP = 14; // plafond du poids appris SENS→moteur
export const ETA = 1.0; // pas d'apprentissage par récompense
export const BETA = 0.4; // température softmax (exploration)

/** Params IDENTIQUES au gate prouvé. `hebbian:false` est NON-NÉGOCIABLE. */
export const CREATURE_PARAMS: SimParams = {
  ...DEFAULT_PARAMS,
  fireFraction: 0.4,
  spontaneous: 0,
  hebbian: false,
  populationCap: 1e5,
};

export type Action = "B" | "C";

/** Construit le cerveau figé à 14 nœuds (câblage exact du gate prouvé). */
export function makeCreatureBrain(): ScaleGraph {
  const specs = Array.from({ length: 14 }, () => ({ state: 0 as const }));
  const edges: Array<[number, number]> = [];
  for (const s of SENS) for (const b of MOT_B) edges.push([s, b]);
  for (const s of SENS) for (const c of MOT_C) edges.push([s, c]);
  for (const n of [2, 4]) for (const p of [6, 7, 8, 9]) edges.push([n, p]);
  for (const n of [3, 5]) for (const p of [10, 11, 12, 13]) edges.push([n, p]);
  for (let i = 6; i <= 13; i++) for (let j = i + 1; j <= 13; j++) edges.push([i, j]);
  return scaleGraphFromEdges(specs, edges);
}

/** Somme des poids appris entre deux pools (le « drive » d'un pool moteur). */
export function poolWeight(g: ScaleGraph, X: number[], Y: number[]): number {
  let s = 0;
  for (const x of X) for (const y of Y) s += weightBetween(g, x, y) ?? 0;
  return s;
}

/** Remet le réseau au repos entre deux essais. */
export function quiesce(g: ScaleGraph): void {
  g.state.fill(0);
  g.stateNext.fill(0);
  g.cooldown.fill(0);
}

/** Politique softmax sur le drive appris SENS→moteur (exploration via rng gainé). */
export function chooseAction(g: ScaleGraph, explore: RNG): Action {
  const dB = poolWeight(g, SENS, MOT_B);
  const dC = poolWeight(g, SENS, MOT_C);
  const pB = 1 / (1 + Math.exp(-BETA * (dB - dC)));
  return explore() < pB ? "B" : "C";
}

/**
 * UN essai = UN tick (sense + act + credit collapsés). Choisit l'action HORS-réseau,
 * force [SENS, moteur] co-actifs, puis crédite la co-décharge SI reward (Hebb modulé
 * par récompense, même tick). Le reward DOIT être fonction de l'action choisie ce tick.
 */
export function trainTrial(
  g: ScaleGraph,
  explore: RNG,
  step: RNG,
  rewardFor: (a: Action) => number,
): { action: Action; reward: number } {
  quiesce(g);
  const action = chooseAction(g, explore);
  const motor = action === "B" ? MOT_B : MOT_C;
  const reward = rewardFor(action);
  applyInput(g, [...SENS, ...motor]);
  stepScale(g, CREATURE_PARAMS, step, false);
  const pre = g.stateNext; // état à T : les forcés y sont à 1
  if (reward) {
    for (let e = 0; e < g.edgeCount; e++) {
      if (pre[g.edgeA[e]] === 1 && pre[g.edgeB[e]] === 1) {
        g.edgeW[e] = Math.min(W_CAP, g.edgeW[e] + ETA * reward);
      }
    }
  }
  return { action, reward };
}

/** Rappel : cue seul (PAS d'exploration) → fraction de B et de C qui déchargent. */
export function recall(g: ScaleGraph, step: RNG): { pB: number; pC: number } {
  quiesce(g);
  applyInput(g, SENS);
  stepScale(g, CREATURE_PARAMS, step, false);
  const st = g.state;
  return {
    pB: MOT_B.reduce((a, b) => a + st[b], 0) / MOT_B.length,
    pC: MOT_C.reduce((a, c) => a + st[c], 0) / MOT_C.length,
  };
}

/**
 * Un « bras » = `trials` essais avec un acteur softmax semé par `seed`, plus le rappel
 * final. `rewardFor(action, t)` donne le reward du tick. Retourne Δ = P(B)−P(C) au rappel,
 * le calendrier de récompenses (pour le bras yoked), et le cerveau entraîné.
 */
export function runArm(
  seed: number,
  rewardFor: (a: Action, t: number) => number,
  trials = 60,
): { delta: number; calendar: number[]; brain: ScaleGraph } {
  const g = makeCreatureBrain();
  const explore = mulberry32(seed);
  const step = mulberry32(0); // non consommé (spontaneous=0) ; ne détermine rien
  const calendar: number[] = [];
  for (let t = 0; t < trials; t++) {
    const { reward } = trainTrial(g, explore, step, (a) => rewardFor(a, t));
    calendar.push(reward);
  }
  const { pB, pC } = recall(g, step);
  return { delta: pB - pC, calendar, brain: g };
}
