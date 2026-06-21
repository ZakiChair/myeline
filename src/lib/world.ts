// Monde 2D « symbolique par essai » de la créature incarnée. PUR & déterministe.
//
// Chaque essai = UN tick d'apprentissage (creature.ts) : la créature sent la pastille
// (cue), choisit « approcher » (B, correct) ou « mauvaise direction » (C) via le softmax
// sur les poids appris, est récompensée si B, et APPREND (reward-Hebb same-tick). Le
// DÉPLACEMENT qui suit est une conséquence VISUELLE de l'action — il ne réinjecte AUCUN
// reward différé (le reward = l'action choisie, pas l'atteinte spatiale de la pastille).
// Ainsi la trajectoire passe du zigzag (B/C ~50/50) au beeline (B dominant) À MESURE que
// la créature apprend : l'apprentissage rendu visible.

import { type ScaleGraph } from "./scale-engine";
import { trainTrial, type Action } from "./creature";
import type { RNG } from "./rng";

export interface Vec {
  x: number;
  y: number;
}

export interface CreatureState {
  pos: Vec; // position de la créature
  heading: number; // cap (radians) pour l'orientation visuelle
  pellet: Vec; // position de la pastille
  trail: Vec[]; // traînée des positions récentes
  trial: number; // n° d'essai
  lastAction: Action | null;
  lastReward: number; // 0/1 — pour le flash récompense
  eaten: number; // pastilles atteintes
}

export const ARENA = 100; // l'arène est le carré [-ARENA, ARENA]²
const STEP = 9; // distance parcourue par essai
const EAT_RADIUS = 8; // distance d'« absorption » de la pastille
const TRAIL_MAX = 140; // longueur max de la traînée

function randomPellet(spawn: RNG): Vec {
  return { x: (spawn() * 2 - 1) * ARENA * 0.9, y: (spawn() * 2 - 1) * ARENA * 0.9 };
}

/** État initial : créature au centre, pastille placée au hasard. */
export function initWorld(spawn: RNG): CreatureState {
  return {
    pos: { x: 0, y: 0 },
    heading: 0,
    pellet: randomPellet(spawn),
    trail: [{ x: 0, y: 0 }],
    trial: 0,
    lastAction: null,
    lastReward: 0,
    eaten: 0,
  };
}

function clamp(v: number): number {
  return Math.max(-ARENA, Math.min(ARENA, v));
}

/**
 * UN essai du monde : apprentissage (trainTrial) PUIS déplacement visuel. Mute `world`
 * et `brain` en place. `explore` = rng de la politique softmax, `step` = rng moteur (non
 * consommé car spontaneous=0), `spawn` = rng du monde (pastilles + direction erronée).
 */
export function stepWorld(
  world: CreatureState,
  brain: ScaleGraph,
  explore: RNG,
  step: RNG,
  spawn: RNG,
  rewardFor: (a: Action) => number = (a) => (a === "B" ? 1 : 0),
): void {
  // 1) Apprentissage : reward selon la contingence (défaut : « approcher » = B). Crédit same-tick.
  const { action, reward } = trainTrial(brain, explore, step, rewardFor);

  // 2) Déplacement (animation du résultat) : vers la pastille si B, direction erronée si C.
  let dx: number;
  let dy: number;
  if (action === "B") {
    const vx = world.pellet.x - world.pos.x;
    const vy = world.pellet.y - world.pos.y;
    const n = Math.hypot(vx, vy) || 1;
    dx = vx / n;
    dy = vy / n;
  } else {
    const ang = spawn() * Math.PI * 2; // direction au hasard (« mauvaise »)
    dx = Math.cos(ang);
    dy = Math.sin(ang);
  }
  world.pos = { x: clamp(world.pos.x + dx * STEP), y: clamp(world.pos.y + dy * STEP) };
  world.heading = Math.atan2(dy, dx);
  world.trail.push(world.pos);
  if (world.trail.length > TRAIL_MAX) world.trail.shift();

  // 3) Pastille atteinte ? (purement visuel — ne pilote PAS le reward).
  if (Math.hypot(world.pos.x - world.pellet.x, world.pos.y - world.pellet.y) < EAT_RADIUS) {
    world.eaten++;
    world.pellet = randomPellet(spawn);
  }

  world.lastAction = action;
  world.lastReward = reward;
  world.trial++;
}
