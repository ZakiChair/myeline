// Substrat d'entrée/sortie pour le moteur Échelle (typed-array). PUR et déterministe.
//
// Prérequis aux tests d'apprentissage : il n'existait aucun moyen de stimuler un set
// de neurones de façon répétable, ni de lire un vecteur d'état, ni de piloter des ticks
// programmés. Ce module fournit les trois primitives.
//
// Piège (cf. modèle Greenberg–Hastings) : un neurone excité passe FORCÉMENT réfractaire
// au tick suivant. Un « clamp sur fenêtre » est donc une RÉ-INJECTION par tick (appliquée
// AVANT stepScale). Un neurone d'entrée décharge donc au plus tous les R+1 ticks → la
// lecture de sortie doit cibler des neurones NON-entrée.

import type { ScaleGraph } from "./scale-engine";
import { stepScale } from "./scale-engine";
import type { SimParams } from "./types";
import type { RNG } from "./rng";
import { VIT_GAIN, VIT_MAX } from "./rules";

/** Force un ensemble de slots à décharger ce tick (électrode focale). Mute g en place. */
export function applyInput(g: ScaleGraph, slots: Iterable<number>): void {
  for (const s of slots) {
    if (!g.alive[s]) continue;
    g.state[s] = 1;
    g.cooldown[s] = 0;
    g.vitality[s] = Math.min(VIT_MAX, g.vitality[s] + VIT_GAIN);
  }
}

/** Lit le vecteur d'état (0/1) des slots demandés, ou de tous les vivants si non précisé. */
export function readState(g: ScaleGraph, slots?: number[]): number[] {
  if (slots) return slots.map((s) => g.state[s]);
  const out: number[] = [];
  for (let i = 0; i < g.capacity; i++) if (g.alive[i]) out.push(g.state[i]);
  return out;
}

/** Un pas du schedule : un set à stimuler (avant le tick) et si le tick développe. */
export interface ScheduleStep {
  input?: number[];
  develop?: boolean;
}

/**
 * Exécute une séquence de ticks. À chaque pas : applyInput(entrée) PUIS stepScale.
 * Retourne le nombre d'excités par tick (pour mesurer activité / branchement).
 */
export function runSchedule(
  g: ScaleGraph,
  params: SimParams,
  rng: RNG,
  schedule: ScheduleStep[],
): { excited: number[] } {
  const excited: number[] = [];
  for (const stepDef of schedule) {
    if (stepDef.input) applyInput(g, stepDef.input);
    const { events } = stepScale(g, params, rng, stepDef.develop ?? false);
    excited.push(events.excited);
  }
  return { excited };
}
