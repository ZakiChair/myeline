// Créature à RÉSERVOIR incarnée (fourrage). Le réservoir tourne en CONTINU (un step/tick,
// l'état persiste = mémoire), nourri par les capteurs ; un readout appris par récompense
// (REINFORCE + trace d'éligibilité, cf. reservoir.ts, gate GO) choisit une primitive motrice ;
// la locomotion (codée) bouge le corps. Le réel = activité du réservoir + politique apprise.
// Le corps + la locomotion = scène codée.

import {
  makeReservoir,
  reservoirParams,
  makeReadout,
  policy,
  sampleAction,
  accumulateEligibility,
  applyReward,
  type Reservoir,
  type Readout,
} from "./reservoir";
import { applyInput } from "./io";
import { stepScale } from "./scale-engine";
import { mulberry32, type RNG } from "./rng";
import type { SimParams } from "./types";

export const ARENA = 100;
export const VISION_BINS = 6; // secteurs de vision (direction relative de la source)
export const ACTIONS = 3; // 0=tourner-G, 1=tourner-D, 2=avancer
const SIZE = 300;
const STEP = 6; // distance avancée par action « avancer »
const TURN = Math.PI / 6; // rotation par action de virage
const EAT_RADIUS = 9;
const LAMBDA = 0.8; // trace d'éligibilité (continue)
const ETA = 0.05;
const ALPHA = 0.05;
const FEAT_DECAY = 0.5; // lissage des features (état binaire → taux)
const SHAPING = 0.3; // récompense de rapprochement (dense, honnêtement étiquetée)
const EAT_BONUS = 1;

const RES_FP: SimParams = reservoirParams(0.21);
const STEP_RNG = mulberry32(0); // non consommé (spontaneous=0)

export interface CreatureWorld {
  x: number;
  y: number;
  heading: number;
  foodX: number;
  foodY: number;
  eaten: number;
  t: number;
  lastReward: number;
  lastAction: number;
  trail: { x: number; y: number }[];
}

export interface ReservoirCreature {
  res: Reservoir;
  ro: Readout;
  world: CreatureWorld;
  feat: Float64Array;
  explore: RNG;
  spawn: RNG;
  learn: boolean;
}

function clampArena(v: number): number {
  return Math.max(-ARENA, Math.min(ARENA, v));
}

function randomFood(spawn: RNG): { x: number; y: number } {
  return { x: (spawn() * 2 - 1) * ARENA * 0.9, y: (spawn() * 2 - 1) * ARENA * 0.9 };
}

export function makeReservoirCreature(seed: number, learn = true): ReservoirCreature {
  const res = makeReservoir(SIZE, VISION_BINS + 1, seed); // +1 canal = toucher
  const ro = makeReadout(ACTIONS, res.readNeurons.length);
  const spawn = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const food = randomFood(spawn);
  const world: CreatureWorld = {
    x: 0,
    y: 0,
    heading: 0,
    foodX: food.x,
    foodY: food.y,
    eaten: 0,
    t: 0,
    lastReward: 0,
    lastAction: -1,
    trail: [{ x: 0, y: 0 }],
  };
  return {
    res,
    ro,
    world,
    feat: new Float64Array(res.readNeurons.length),
    explore: mulberry32(seed * 13 + 7),
    spawn,
    learn,
  };
}

/** Capteurs → canaux d'entrée actifs : vue (secteur de la source) + toucher (contact). */
export function sense(w: CreatureWorld): number[] {
  const dx = w.foodX - w.x;
  const dy = w.foodY - w.y;
  const dist = Math.hypot(dx, dy);
  let ang = Math.atan2(dy, dx) - w.heading;
  ang = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const bin = Math.floor((ang / (2 * Math.PI)) * VISION_BINS) % VISION_BINS;
  const channels = [bin]; // canal de vision = secteur
  if (dist < EAT_RADIUS) channels.push(VISION_BINS); // canal toucher
  return channels;
}

/** Un step réservoir CONTINU (pas de quiesce) + mise à jour des features lissées. */
function reservoirStep(c: ReservoirCreature, channels: number[]): void {
  const { res, feat } = c;
  const clamp: number[] = [];
  for (const ch of channels) clamp.push(...res.inputs[ch]);
  if (clamp.length) applyInput(res.g, clamp);
  stepScale(res.g, RES_FP, STEP_RNG, false);
  const st = res.g.state;
  const rn = res.readNeurons;
  for (let i = 0; i < rn.length; i++) feat[i] = (1 - FEAT_DECAY) * feat[i] + FEAT_DECAY * st[rn[i]];
}

/** Un tick monde : sentir → réservoir → politique → bouger → récompense → apprendre. Mute en place. */
export function stepCreature(c: ReservoirCreature): void {
  const w = c.world;
  const channels = sense(w);
  reservoirStep(c, channels);

  const p = policy(c.ro, c.feat);
  const action = sampleAction(p, c.explore);
  accumulateEligibility(c.ro, c.feat, action, p, LAMBDA);

  const distBefore = Math.hypot(w.foodX - w.x, w.foodY - w.y);
  if (action === 0) w.heading -= TURN;
  else if (action === 1) w.heading += TURN;
  else {
    w.x = clampArena(w.x + Math.cos(w.heading) * STEP);
    w.y = clampArena(w.y + Math.sin(w.heading) * STEP);
  }
  const distAfter = Math.hypot(w.foodX - w.x, w.foodY - w.y);

  let reward = c.learn ? Math.sign(distBefore - distAfter) * SHAPING : 0; // shaping de rapprochement
  if (distAfter < EAT_RADIUS) {
    w.eaten++;
    reward += EAT_BONUS;
    const f = randomFood(c.spawn);
    w.foodX = f.x;
    w.foodY = f.y;
  }
  if (c.learn) applyReward(c.ro, reward, ETA, ALPHA);

  w.lastReward = reward;
  w.lastAction = action;
  w.t++;
  w.trail.push({ x: w.x, y: w.y });
  if (w.trail.length > 160) w.trail.shift();
}
