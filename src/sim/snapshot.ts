// Instantané d'un organisme pour le rendu du lot 2 — fonction PURE : elle lit
// l'organisme et produit des COPIES (le worker les poste au thread principal sans
// que personne ne mute l'état sous-jacent entre deux messages).

import type { Organism } from "./organism";
import { median } from "./metrics";
import type { MotorAction } from "./params";

/** État du monde tel que l'affiché : positions copiées, jamais aliasées. */
export interface WorldSnap {
  x: number;
  y: number;
  hx: number;
  hy: number;
  energy: number;
  alive: boolean;
  lifeTicks: number;
  predX: number;
  predY: number;
  foodX: Float32Array;
  foodY: Float32Array;
  foodCd: Int32Array;
  toxinX: Float32Array;
  toxinY: Float32Array;
  toxinCd: Int32Array;
  arena: number;
}

export interface VieSnapshot {
  /** Horloge du réseau (ticks). */
  t: number;
  world: WorldSnap;
  /** Copie des quatre accumulateurs moteurs — la course au seuil en direct. */
  acc: Float32Array;
  accSeuil: number;
  ticksSinceDecision: number;
  lastDecision: MotorAction | null;
  lastAction: MotorAction | null;
  /** Décharges du dernier tick, réseau entier. */
  spikesLastTick: number;
  /** Dernière dopamine émise (capturée via la couture dopamineSource). */
  da: number;
  deaths: number;
  ateFood: number;
  ateToxin: number;
  hits: number;
  lastLifetime: number;
  lifetimeMedian: number;
  energyMean: number;
  rewardMean: number;
  /** Débit réellement mesuré dans le worker (ticks/s), pas un réglage. */
  measuredTps: number;
}

export function snapshotOrganism(
  org: Organism,
  da: number,
  measuredTps: number,
): VieSnapshot {
  const w = org.world;
  const m = org.metrics;
  return {
    t: org.brain.lif.t,
    world: {
      x: w.x,
      y: w.y,
      hx: w.hx,
      hy: w.hy,
      energy: w.energy,
      alive: w.alive,
      lifeTicks: w.lifeTicks,
      predX: w.predX,
      predY: w.predY,
      foodX: w.foodX.slice(),
      foodY: w.foodY.slice(),
      foodCd: w.foodCooldown.slice(),
      toxinX: w.toxinX.slice(),
      toxinY: w.toxinY.slice(),
      toxinCd: w.toxinCooldown.slice(),
      arena: org.params.world.arena,
    },
    acc: org.brain.acc.slice(),
    accSeuil: org.brain.params.accSeuil,
    ticksSinceDecision: org.brain.ticksSinceDecision,
    lastDecision: org.brain.lastDecision,
    lastAction: org.lastAction,
    spikesLastTick: org.brain.lif.spikeCount,
    da,
    deaths: m.deaths,
    ateFood: m.ateFood,
    ateToxin: m.ateToxin,
    hits: m.hits,
    lastLifetime: w.lastLifetime,
    lifetimeMedian: median(m.lifetimes),
    energyMean: m.ticks > 0 ? m.energySum / m.ticks : NaN,
    rewardMean: m.ticks > 0 ? m.rewardSum / m.ticks : NaN,
    measuredTps,
  };
}
