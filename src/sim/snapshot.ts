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

/** État du module olfactif (rang 5), si actif. */
export interface VoieSnap {
  /** Odeur dominante injectée au dernier tick : 0 rien, 1 nourriture, 2 toxine. */
  odeur: number;
  /** Décharges par tick des sorties du module, lissées sur le batch écoulé. */
  mbon: number;
  ser: number;
  /** Poids moyens des couches apprises, groupés par odeur des KC sources. */
  wMbonFood: number;
  wMbonToxin: number;
  wSerFood: number;
  wSerToxin: number;
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
  /** Le module olfactif appris — null si inactif. */
  voie: VoieSnap | null;
}

export function snapshotOrganism(
  org: Organism,
  da: number,
  measuredTps: number,
  /** Contexte de lecture du module : répondeurs par code (mesurés au build) et
   *  taux de décharge MBON/SER lissés par le worker. */
  voieCtx?: {
    repFood: Set<number>;
    repToxin: Set<number>;
    mbon: number;
    ser: number;
  },
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
    voie: org.voie && voieCtx ? voieSnap(org, voieCtx) : null,
  };
}

/** Poids moyens des couches apprises, groupés par l'odeur qui fait décharger la
 *  KC source — la lecture directe de la carte apprise, en direct. */
function voieSnap(
  org: Organism,
  ctx: { repFood: Set<number>; repToxin: Set<number>; mbon: number; ser: number },
): VoieSnap {
  const v = org.voie!;
  const set = v.plast.plastSet!;
  const src = v.plast.plastSrc!;
  const dst = v.topo.outTarget;
  const poids = v.topo.w;
  const m0 = v.bornes.mbon.start;
  const m1 = m0 + v.bornes.mbon.count;
  const somme = { mf: 0, mt: 0, nf: 0, nt: 0, sf: 0, st: 0, kf: 0, kt: 0 };
  for (let q = 0; q < set.length; q++) {
    const e = set[q];
    const s = src[q];
    const w = poids[e];
    if (dst[e] >= m0 && dst[e] < m1) {
      if (ctx.repFood.has(s)) { somme.mf += w; somme.nf++; }
      else if (ctx.repToxin.has(s)) { somme.mt += w; somme.nt++; }
    } else {
      if (ctx.repFood.has(s)) { somme.sf += w; somme.kf++; }
      else if (ctx.repToxin.has(s)) { somme.st += w; somme.kt++; }
    }
  }
  return {
    odeur: org.odeurCourante,
    mbon: ctx.mbon,
    ser: ctx.ser,
    wMbonFood: somme.nf > 0 ? somme.mf / somme.nf : 0,
    wMbonToxin: somme.nt > 0 ? somme.mt / somme.nt : 0,
    wSerFood: somme.kf > 0 ? somme.sf / somme.kf : 0,
    wSerToxin: somme.kt > 0 ? somme.st / somme.kt : 0,
  };
}
