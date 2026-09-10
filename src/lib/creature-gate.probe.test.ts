import { describe, it, expect } from "vitest";
import { scaleGraphFromEdges, stepScale, weightBetween, type ScaleGraph } from "./scale-engine";
import { applyInput } from "./io";
import { mulberry32, type RNG } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimParams } from "./types";

// GATE CRÉATURE (redessiné) — l'apprentissage de contingence émerge-t-il avec
// ACTEUR STOCHASTIQUE (rng gainé = reproductible) + HEBB MODULÉ PAR RÉCOMPENSE
// (co-activation même-tick gatée par reward — la règle que ce substrat supporte) ?
//
// Tâche operante minimale : cue (SENS) présent ; l'agent "essaie" une action en
// forçant un pool moteur (B=correct, C=incorrect, jumeaux au départ). Reward si action=B.
// Au rappel (cue seul, sans exploration), un agent qui a appris décharge B et pas C.
// 3 bras : appris / yoked (même calendrier de reward, décorrélé de l'action) / aléatoire.

const SENS = [0, 1], B = [2, 3], C = [4, 5];
const W_MAX = 14, ETA = 1.0, BETA = 0.4; // BETA = température softmax
const TRIALS = 60;

function makeGraph(): ScaleGraph {
  const specs = Array.from({ length: 14 }, () => ({ state: 0 as const }));
  const edges: Array<[number, number]> = [];
  for (const s of SENS) for (const b of B) edges.push([s, b]);
  for (const s of SENS) for (const c of C) edges.push([s, c]);
  for (const n of [2, 4]) for (const p of [6, 7, 8, 9]) edges.push([n, p]);
  for (const n of [3, 5]) for (const p of [10, 11, 12, 13]) edges.push([n, p]);
  for (let i = 6; i <= 13; i++) for (let j = i + 1; j <= 13; j++) edges.push([i, j]);
  return scaleGraphFromEdges(specs, edges);
}

const P: SimParams = { ...DEFAULT_PARAMS, fireFraction: 0.4, spontaneous: 0, hebbian: false, populationCap: 1e5 };
const STEP_RNG = mulberry32(0); // non consommé (spontaneous=0) ; détermine rien

function wBetween(g: ScaleGraph, X: number[], Y: number[]): number {
  let s = 0;
  for (const x of X) for (const y of Y) s += weightBetween(g, x, y) ?? 0;
  return s;
}

function quiesce(g: ScaleGraph) { g.state.fill(0); g.stateNext.fill(0); g.cooldown.fill(0); }

/** Politique softmax sur le drive appris SENS→action (exploration via rng gainé). */
function choose(g: ScaleGraph, rng: RNG): number[] {
  const dB = wBetween(g, SENS, B), dC = wBetween(g, SENS, C);
  const pB = 1 / (1 + Math.exp(-BETA * (dB - dC)));
  return rng() < pB ? B : C;
}

/**
 * Un bras = TRIALS essais avec un acteur softmax (graine `seed`). À chaque essai :
 * choisir une action, la forcer co-active avec le cue, créditer la co-activation si reward.
 * `rewardFn(t, choseB)` donne le reward du tick. Retourne Δ=P(B)−P(C) au rappel + le calendrier.
 */
function runArm(seed: number, rewardFn: (t: number, choseB: boolean) => number): { delta: number; calendar: number[] } {
  const g = makeGraph();
  const rng = mulberry32(seed);
  const calendar: number[] = [];
  for (let t = 0; t < TRIALS; t++) {
    quiesce(g);
    const motor = choose(g, rng);
    const reward = rewardFn(t, motor === B);
    calendar.push(reward);
    applyInput(g, [...SENS, ...motor]);
    stepScale(g, P, STEP_RNG, false);
    const pre = g.stateNext; // état à T (les forcés y sont à 1)
    if (reward) for (let e = 0; e < g.edgeCount; e++) if (pre[g.edgeA[e]] === 1 && pre[g.edgeB[e]] === 1) g.edgeW[e] = Math.min(W_MAX, g.edgeW[e] + ETA * reward);
  }
  const r = recall(g);
  return { delta: r.pB - r.pC, calendar };
}

/** Rappel : cue seul (pas d'exploration) → fraction de B et de C qui déchargent. */
function recall(g: ScaleGraph): { pB: number; pC: number } {
  quiesce(g);
  applyInput(g, SENS);
  stepScale(g, P, STEP_RNG, false);
  const st = g.state;
  return {
    pB: B.reduce((a, b) => a + st[b], 0) / B.length,
    pC: C.reduce((a, c) => a + st[c], 0) / C.length,
  };
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe("[GATE] créature redessinée : apprentissage de contingence", () => {
  it("moyenné sur 16 graines : appris ≫ yoked ≈ aléatoire (Δ = P(B)−P(C))", () => {
    const L: number[] = [], Y: number[] = [], Rn: number[] = [];
    for (const s of SEEDS) {
      // APPRIS : reward ssi l'action choisie = B (la contingence). Calendrier enregistré.
      const learned = runArm(s, (_t, choseB) => (choseB ? 1 : 0));
      // YOKED : MÊME calendrier de reward (mêmes ticks récompensés) mais DÉCORRÉLÉ de l'action
      //         choisie par le yoked (exploration indépendante, graine décalée).
      const yoked = runArm(s + 1000, (t) => learned.calendar[t]);
      // ALÉATOIRE : aucun reward.
      const random = runArm(s + 2000, () => 0);
      L.push(learned.delta); Y.push(yoked.delta); Rn.push(random.delta);
    }
    const mL = mean(L), mY = mean(Y), mR = mean(Rn);
    console.log(`\n[GATE créature] moyennes sur ${SEEDS.length} graines :`);
    console.log(`  APPRIS    Δ̄=${mL.toFixed(2)}   (par graine : ${L.map((d) => d.toFixed(1)).join(" ")})`);
    console.log(`  YOKED     Δ̄=${mY.toFixed(2)}   (par graine : ${Y.map((d) => d.toFixed(1)).join(" ")})`);
    console.log(`  ALÉATOIRE Δ̄=${mR.toFixed(2)}`);
    console.log(`[GATE créature] → contingence APPRISE : ${mL >= 0.7 && mL > mY + 0.4 && mL > mR + 0.4 ? "OUI ✅" : "NON ❌"}\n`);
    expect(mL).toBeGreaterThanOrEqual(0.7); // l'appris apprend B de façon fiable
    expect(mL).toBeGreaterThan(mY + 0.4); // ≫ yoked (le reward seul n'explique pas)
    expect(mL).toBeGreaterThan(mR + 0.4); // ≫ aléatoire
  });
});
