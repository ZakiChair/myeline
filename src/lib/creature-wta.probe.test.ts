import { describe, it, expect } from "vitest";
import { scaleGraphFromEdges, stepScale, weightBetween, type ScaleGraph } from "./scale-engine";
import { applyInput } from "./io";
import { mulberry32, type RNG } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimParams } from "./types";

// PAYOFF — l'inhibition latérale (Palier 1) récupère-t-elle la discrimination perdue par
// interférence sur cues chevauchants ? Pool inhibiteur INH (sign=-1) excité par B,C et les
// inhibant en retour (feedback gain-control : la même arête non orientée B–INH donne
// "B excite INH" + "INH inhibe B"). Rappel FENÊTRÉ multi-pas (le substrat est excitable :
// pas d'état stable, on intègre le taux sur une fenêtre, cue clampé chaque pas).

const cueL = [0, 1, 2], cueR = [2, 3, 4], B = [5, 6], C = [7, 8]; // overlap sur neurone 2
const balB = [9, 10, 11, 12], balC = [13, 14, 15, 16], INH = [17, 18];
const cueAll = [0, 1, 2, 3, 4];
const W_MAX = 14, ETA = 1.0, BETA = 0.4, TRIALS = 160, K = 9;
const P: SimParams = { ...DEFAULT_PARAMS, fireFraction: 0.4, spontaneous: 0, hebbian: false, populationCap: 1e5 };
const STEP_RNG = mulberry32(0);

function makeGraph(withInh: boolean, wInh: number): ScaleGraph {
  const n = withInh ? 19 : 17;
  const specs = Array.from({ length: n }, () => ({ state: 0 as const }));
  const edges: Array<[number, number, number]> = [];
  for (const a of cueAll) for (const m of [...B, ...C]) edges.push([a, m, 5]);
  for (const b of B) for (const p of balB) edges.push([b, p, 5]);
  for (const c of C) for (const p of balC) edges.push([c, p, 5]);
  const ball = [...balB, ...balC];
  for (let i = 0; i < ball.length; i++) for (let j = i + 1; j < ball.length; j++) edges.push([ball[i], ball[j], 5]);
  if (withInh) for (const inh of INH) for (const m of [...B, ...C]) edges.push([m, inh, wInh]); // B,C ↔ INH
  const g = scaleGraphFromEdges(specs, edges);
  if (withInh) for (const inh of INH) g.sign[inh] = -1; // INH = inhibiteurs (Dale)
  return g;
}

function wBetween(g: ScaleGraph, X: number[], Y: number[]): number {
  let s = 0;
  for (const x of X) for (const y of Y) s += weightBetween(g, x, y) ?? 0;
  return s;
}
function quiesce(g: ScaleGraph) { g.state.fill(0); g.stateNext.fill(0); g.cooldown.fill(0); }
function choose(g: ScaleGraph, cue: number[], rng: RNG): number[] {
  const dB = wBetween(g, cue, B), dC = wBetween(g, cue, C);
  return rng() < 1 / (1 + Math.exp(-BETA * (dB - dC))) ? B : C;
}

/** Entraîne (single-pas, reward-Hebb) ; INH inerte (ne décharge pas dans un trial 1-pas). */
function train(g: ScaleGraph, seed: number) {
  const rng = mulberry32(seed);
  for (let t = 0; t < TRIALS; t++) {
    const cueL_ = t % 2 === 0;
    const cue = cueL_ ? cueL : cueR;
    quiesce(g);
    const motor = choose(g, cue, rng);
    const reward = (cueL_ && motor === B) || (!cueL_ && motor === C) ? 1 : 0;
    applyInput(g, [...cue, ...motor]);
    stepScale(g, P, STEP_RNG, false);
    const pre = g.stateNext;
    if (reward) for (let e = 0; e < g.edgeCount; e++) if (pre[g.edgeA[e]] === 1 && pre[g.edgeB[e]] === 1) g.edgeW[e] = Math.min(W_MAX, g.edgeW[e] + ETA * reward);
  }
}

/** Taux de décharge d'un pool sur une fenêtre de K pas, cue clampé. */
function windowRate(g: ScaleGraph, cue: number[], pool: number[]): number {
  quiesce(g);
  let fired = 0;
  for (let k = 0; k < K; k++) {
    applyInput(g, cue); // re-clamp chaque pas
    stepScale(g, P, STEP_RNG, false);
    fired += pool.reduce((a, p) => a + g.state[p], 0);
  }
  return fired / (K * pool.length);
}
/** Discrimination 1-pas (lecture instantanée à t+1). */
function discr1(g: ScaleGraph): number {
  const f = (cue: number[], pool: number[]) => { quiesce(g); applyInput(g, cue); stepScale(g, P, STEP_RNG, false); return pool.reduce((a, p) => a + g.state[p], 0) / pool.length; };
  return 0.5 * ((f(cueL, B) - f(cueL, C)) + (f(cueR, C) - f(cueR, B)));
}
/** Discrimination fenêtrée (taux sur K pas). */
function discrWin(g: ScaleGraph): number {
  return 0.5 * ((windowRate(g, cueL, B) - windowRate(g, cueL, C)) + (windowRate(g, cueR, C) - windowRate(g, cueR, B)));
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe("[GATE] payoff inhibition latérale (WTA) sur cues chevauchants", () => {
  it("compare 1-pas (baseline) vs fenêtre sans inh vs fenêtre avec inh", () => {
    const base: number[] = [], win: number[] = [], winInh: number[] = [];
    for (const s of SEEDS) {
      const g0 = makeGraph(false, 0); train(g0, s); base.push(discr1(g0)); win.push(discrWin(g0));
      const gi = makeGraph(true, 6); train(gi, s); winInh.push(discrWin(gi));
    }
    const mB = mean(base), mW = mean(win), mI = mean(winInh);
    // eslint-disable-next-line no-console
    console.log(`\n[WTA] discrimination moyenne sur ${SEEDS.length} graines (overlap, 1=parfait) :`);
    // eslint-disable-next-line no-console
    console.log(`  1-pas (baseline)      s̄=${mB.toFixed(2)}   (${base.map((d) => d.toFixed(1)).join(" ")})`);
    // eslint-disable-next-line no-console
    console.log(`  fenêtre sans inh      s̄=${mW.toFixed(2)}   (${win.map((d) => d.toFixed(1)).join(" ")})`);
    // eslint-disable-next-line no-console
    console.log(`  fenêtre AVEC inh      s̄=${mI.toFixed(2)}   (${winInh.map((d) => d.toFixed(1)).join(" ")})`);
    // eslint-disable-next-line no-console
    console.log(`[WTA] → l'inhibition récupère : ${(mI - mW).toFixed(2)} vs fenêtre seule ; ${(mI - mB).toFixed(2)} vs baseline\n`);
    expect(Number.isFinite(mI)).toBe(true);
  });
});
