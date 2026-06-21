// Reservoir computing : un réseau excitable FIGÉ à la criticité transforme les capteurs en
// une activité riche ; un readout linéaire APPRIS PAR RÉCOMPENSE (REINFORCE + trace
// d'éligibilité) lit cette activité pour choisir une action. Le réservoir ne change pas
// (develop=false, hebbian=false) ; SEUL le readout apprend ⇒ single-layer, pas le mur du
// crédit multi-tick (la mémoire temporelle vit dans l'état du réservoir).

import { createScaleGraph, stepScale, type ScaleGraph } from "./scale-engine";
import { applyInput } from "./io";
import { mulberry32, type RNG } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimParams } from "./types";

export interface Reservoir {
  g: ScaleGraph;
  size: number;
  inputs: number[][]; // un groupe de neurones d'entrée par canal de capteur
  readNeurons: number[]; // neurones lus (disjoints des entrées)
}

/** Params du réservoir : figé, près de σ≈1, déterministe (spontaneous=0). */
export function reservoirParams(fireFraction = 0.21): SimParams {
  return { ...DEFAULT_PARAMS, fireFraction, spontaneous: 0, hebbian: false };
}

/** Construit un réservoir figé : topologie aléatoire fixe + groupes E/S réservés. */
export function makeReservoir(
  size: number,
  channels: number,
  seed: number,
  perChannel = 8,
  nRead = 160,
): Reservoir {
  const p = { ...reservoirParams(), initialCount: size, populationCap: size };
  const g = createScaleGraph(p, mulberry32(seed));
  const inputs: number[][] = [];
  let idx = 0;
  for (let c = 0; c < channels; c++) {
    const grp: number[] = [];
    for (let k = 0; k < perChannel; k++) grp.push(idx++);
    inputs.push(grp);
  }
  const readNeurons: number[] = [];
  for (let n = idx; n < Math.min(size, idx + nRead); n++) readNeurons.push(n);
  return { g, size, inputs, readNeurons };
}

const STEP_RNG = mulberry32(0); // non consommé (spontaneous=0) ; ne détermine rien

/**
 * Présente les canaux actifs au réservoir pendant `settle` ticks (ré-injection par tick, car
 * un neurone excité passe réfractaire), puis retourne le vecteur de features = taux de
 * décharge des neurones de lecture sur la fenêtre `readWin` finale.
 */
export function presentAndRead(
  res: Reservoir,
  activeChannels: number[],
  fp: SimParams,
  settle = 8,
  readWin = 5,
): Float64Array {
  const { g, inputs, readNeurons } = res;
  g.state.fill(0);
  g.stateNext.fill(0);
  g.cooldown.fill(0);
  const feat = new Float64Array(readNeurons.length);
  const clamp: number[] = [];
  for (const c of activeChannels) clamp.push(...inputs[c]);
  for (let t = 0; t < settle; t++) {
    applyInput(g, clamp);
    stepScale(g, fp, STEP_RNG, false);
    if (t >= settle - readWin) {
      const st = g.state;
      for (let i = 0; i < readNeurons.length; i++) feat[i] += st[readNeurons[i]];
    }
  }
  for (let i = 0; i < feat.length; i++) feat[i] /= readWin;
  return feat;
}

/**
 * Exécute un SCHEDULE de stimulation (liste des canaux actifs à chaque tick — `[]` = blanc),
 * et retourne les features (taux des neurones de lecture sur la fenêtre `readWin` finale) +
 * la série d'excités par tick (pour estimer σ). Permet les tâches À MÉMOIRE : flasher le cue
 * puis blanc ⇒ au moment de lire, l'info ne survit que dans l'activité résiduelle du réservoir.
 */
export function runReservoirSchedule(
  res: Reservoir,
  schedule: number[][],
  fp: SimParams,
  readWin = 4,
): { feat: Float64Array; excited: number[] } {
  const { g, inputs, readNeurons } = res;
  g.state.fill(0);
  g.stateNext.fill(0);
  g.cooldown.fill(0);
  const feat = new Float64Array(readNeurons.length);
  const excited: number[] = [];
  const T = schedule.length;
  for (let t = 0; t < T; t++) {
    const clamp: number[] = [];
    for (const c of schedule[t]) clamp.push(...inputs[c]);
    if (clamp.length) applyInput(g, clamp);
    const { events } = stepScale(g, fp, STEP_RNG, false);
    excited.push(events.excited);
    if (t >= T - readWin) {
      const st = g.state;
      for (let i = 0; i < readNeurons.length; i++) feat[i] += st[readNeurons[i]];
    }
  }
  for (let i = 0; i < feat.length; i++) feat[i] /= readWin;
  return { feat, excited };
}

// ───────────────────────── Readout appris par récompense ─────────────────────────

export interface Readout {
  nActions: number;
  nFeat: number;
  W: Float64Array; // [nActions * nFeat]
  elig: Float64Array;
  rBar: number; // baseline (moyenne glissante de la récompense) → réduit la variance
}

export function makeReadout(nActions: number, nFeat: number): Readout {
  return {
    nActions,
    nFeat,
    W: new Float64Array(nActions * nFeat),
    elig: new Float64Array(nActions * nFeat),
    rBar: 0,
  };
}

/** Politique softmax sur les logits W·features. */
export function policy(ro: Readout, feat: Float64Array): number[] {
  const logits = new Array<number>(ro.nActions);
  for (let k = 0; k < ro.nActions; k++) {
    let s = 0;
    const off = k * ro.nFeat;
    for (let i = 0; i < ro.nFeat; i++) s += ro.W[off + i] * feat[i];
    logits[k] = s;
  }
  let m = logits[0];
  for (let k = 1; k < logits.length; k++) if (logits[k] > m) m = logits[k];
  let Z = 0;
  const p = new Array<number>(ro.nActions);
  for (let k = 0; k < ro.nActions; k++) {
    p[k] = Math.exp(logits[k] - m);
    Z += p[k];
  }
  for (let k = 0; k < ro.nActions; k++) p[k] /= Z;
  return p;
}

export function sampleAction(p: number[], rng: RNG): number {
  const u = rng();
  let c = 0;
  for (let k = 0; k < p.length; k++) {
    c += p[k];
    if (u < c) return k;
  }
  return p.length - 1;
}

/** Remet la trace d'éligibilité à zéro (entre essais indépendants). */
export function resetEligibility(ro: Readout): void {
  ro.elig.fill(0);
}

/**
 * REINFORCE + éligibilité : accumule la trace `feat ⊗ (1{action} − proba)` (gradient du
 * log de la politique) avec décroissance `lambda`, PUIS applique `W += η·(R − R̄)·elig` à la
 * récompense. `lambda=0` ⇒ une décision/essai (sous-gate 1) ; `lambda>0` ⇒ crédit différé.
 */
export function accumulateEligibility(
  ro: Readout,
  feat: Float64Array,
  action: number,
  p: number[],
  lambda: number,
): void {
  for (let k = 0; k < ro.nActions; k++) {
    const grad = (k === action ? 1 : 0) - p[k];
    const off = k * ro.nFeat;
    for (let i = 0; i < ro.nFeat; i++) {
      ro.elig[off + i] = lambda * ro.elig[off + i] + feat[i] * grad;
    }
  }
}

/** Décroissance de la trace (le temps passe entre l'action et la récompense différée). */
export function decayEligibility(ro: Readout, lambda: number): void {
  const e = ro.elig;
  for (let j = 0; j < e.length; j++) e[j] *= lambda;
}

export function applyReward(ro: Readout, reward: number, eta: number, alphaBaseline: number): void {
  const delta = reward - ro.rBar;
  const W = ro.W;
  const e = ro.elig;
  for (let j = 0; j < W.length; j++) W[j] += eta * delta * e[j];
  ro.rBar += alphaBaseline * (reward - ro.rBar);
}
