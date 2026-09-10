import { describe, it, expect } from "vitest";
import { scaleGraphFromEdges, stepScale, weightBetween, type ScaleGraph } from "./scale-engine";
import { applyInput } from "./io";
import { mulberry32, type RNG } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimParams } from "./types";

// GATE MULTI-CUE — vraie DISCRIMINATION : CUE_L→B et CUE_R→C (deux réponses selon le
// contexte). Acteur softmax context-dépendant + Hebb modulé par récompense, 3-bras moyenné.
// On compare CUES DISJOINTS (linéairement séparable, trivial) vs CUES QUI SE CHEVAUCHENT
// (entrées similaires → interférence → là où l'inhibition/séparation pourrait gagner sa place).

interface Task { cueL: number[]; cueR: number[]; B: number[]; C: number[]; balB: number[]; balC: number[]; n: number }

const DISJOINT: Task = { cueL: [0, 1], cueR: [2, 3], B: [4, 5], C: [6, 7], balB: [8, 9, 10, 11], balC: [12, 13, 14, 15], n: 16 };
// cueL et cueR PARTAGENT le neurone 2 (sur 3) → contextes à 66 % identiques.
const OVERLAP: Task = { cueL: [0, 1, 2], cueR: [2, 3, 4], B: [5, 6], C: [7, 8], balB: [9, 10, 11, 12], balC: [13, 14, 15, 16], n: 17 };

const W_MAX = 14, ETA = 1.0, BETA = 0.4, TRIALS = 160;
const P: SimParams = { ...DEFAULT_PARAMS, fireFraction: 0.4, spontaneous: 0, hebbian: false, populationCap: 1e5 };
const STEP_RNG = mulberry32(0);

function makeGraph(tk: Task): ScaleGraph {
  const specs = Array.from({ length: tk.n }, () => ({ state: 0 as const }));
  const edges: Array<[number, number]> = [];
  const cueNeurons = Array.from(new Set([...tk.cueL, ...tk.cueR]));
  for (const a of cueNeurons) for (const m of [...tk.B, ...tk.C]) edges.push([a, m]);
  for (const b of tk.B) for (const p of tk.balB) edges.push([b, p]);
  for (const c of tk.C) for (const p of tk.balC) edges.push([c, p]);
  const ball = [...tk.balB, ...tk.balC];
  for (let i = 0; i < ball.length; i++) for (let j = i + 1; j < ball.length; j++) edges.push([ball[i], ball[j]]);
  return scaleGraphFromEdges(specs, edges);
}

function wBetween(g: ScaleGraph, X: number[], Y: number[]): number {
  let s = 0;
  for (const x of X) for (const y of Y) s += weightBetween(g, x, y) ?? 0;
  return s;
}
function quiesce(g: ScaleGraph) { g.state.fill(0); g.stateNext.fill(0); g.cooldown.fill(0); }

function choose(g: ScaleGraph, tk: Task, cue: number[], rng: RNG): number[] {
  const dB = wBetween(g, cue, tk.B), dC = wBetween(g, cue, tk.C);
  return rng() < 1 / (1 + Math.exp(-BETA * (dB - dC))) ? tk.B : tk.C;
}
function fire(g: ScaleGraph, cue: number[], pool: number[]): number {
  quiesce(g);
  applyInput(g, cue);
  stepScale(g, P, STEP_RNG, false);
  return pool.reduce((a, n) => a + g.state[n], 0) / pool.length;
}
function discrimination(g: ScaleGraph, tk: Task): number {
  return 0.5 * ((fire(g, tk.cueL, tk.B) - fire(g, tk.cueL, tk.C)) + (fire(g, tk.cueR, tk.C) - fire(g, tk.cueR, tk.B)));
}

function runArm(tk: Task, seed: number, rewardFn: (t: number, cueL: boolean, choseB: boolean) => number): { score: number; calendar: number[] } {
  const g = makeGraph(tk);
  const rng = mulberry32(seed);
  const calendar: number[] = [];
  for (let t = 0; t < TRIALS; t++) {
    const cueL = t % 2 === 0;
    const cue = cueL ? tk.cueL : tk.cueR;
    quiesce(g);
    const motor = choose(g, tk, cue, rng);
    const reward = rewardFn(t, cueL, motor === tk.B);
    calendar.push(reward);
    applyInput(g, [...cue, ...motor]);
    stepScale(g, P, STEP_RNG, false);
    const pre = g.stateNext;
    if (reward) for (let e = 0; e < g.edgeCount; e++) if (pre[g.edgeA[e]] === 1 && pre[g.edgeB[e]] === 1) g.edgeW[e] = Math.min(W_MAX, g.edgeW[e] + ETA * reward);
  }
  return { score: discrimination(g, tk), calendar };
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

function scenario(tk: Task): { mL: number; mY: number; mR: number; L: number[] } {
  const L: number[] = [], Y: number[] = [], Rn: number[] = [];
  for (const s of SEEDS) {
    const learned = runArm(tk, s, (_t, cueL, choseB) => ((cueL && choseB) || (!cueL && !choseB) ? 1 : 0));
    const yoked = runArm(tk, s + 1000, (t) => learned.calendar[t]);
    const random = runArm(tk, s + 2000, () => 0);
    L.push(learned.score); Y.push(yoked.score); Rn.push(random.score);
  }
  return { mL: mean(L), mY: mean(Y), mR: mean(Rn), L };
}

describe("[GATE] discrimination multi-cue : disjoint vs chevauchant", () => {
  it("mesure la discrimination apprise selon le recouvrement des contextes", () => {
    const dj = scenario(DISJOINT);
    const ov = scenario(OVERLAP);
    const line = (name: string, r: { mL: number; mY: number; mR: number }) =>
      `  ${name.padEnd(11)} appris s̄=${r.mL.toFixed(2)}  yoked s̄=${r.mY.toFixed(2)}  aléatoire s̄=${r.mR.toFixed(2)}`;
    console.log(`\n[GATE multi-cue] discrimination moyenne sur ${SEEDS.length} graines (1 = parfait) :`);
    console.log(line("DISJOINT", dj));
    console.log(line("CHEVAUCHANT", ov) + `   (par graine appris : ${ov.L.map((d) => d.toFixed(1)).join(" ")})`);
    console.log(`[GATE multi-cue] → interférence due au chevauchement : ${(dj.mL - ov.mL).toFixed(2)} de perte de discrimination${ov.mL < 0.6 ? "  ⚠️ (l'inhibition latérale pourrait aider)" : ""}\n`);
    expect(Number.isFinite(dj.mL) && Number.isFinite(ov.mL)).toBe(true);
  });
});
