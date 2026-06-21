import { describe, it } from "vitest";
import { scaleGraphFromEdges, stepScale, weightBetween, type ScaleGraph } from "./scale-engine";
import { applyInput } from "./io";
import { mulberry32 } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimParams } from "./types";

// SONDE JETABLE — vérifie le NO-GO du plan NAÏF (règle à 3 facteurs pré→post,
// déterministe, jumeaux B/C, reward global, ZÉRO exploration). Attendu : ΔW≈0, élig≈0.
// Architecture = scaffold prouvé d'associative.test : A=cue {0,1}, B=correct {2,3},
// C=incorrect {4,5}, ballast clique {6..13}. φ=0.4, spontaneous=0.

const A = [0, 1], B = [2, 3], C = [4, 5];
const GAMMA = 0.85, ETA = 0.5, W_MAX = 14;

function makeGraph(): ScaleGraph {
  const specs = Array.from({ length: 14 }, () => ({ state: 0 as const }));
  const edges: Array<[number, number]> = [];
  for (const a of A) for (const b of B) edges.push([a, b]);
  for (const a of A) for (const c of C) edges.push([a, c]);
  for (const n of [2, 4]) for (const p of [6, 7, 8, 9]) edges.push([n, p]);
  for (const n of [3, 5]) for (const p of [10, 11, 12, 13]) edges.push([n, p]);
  for (let i = 6; i <= 13; i++) for (let j = i + 1; j <= 13; j++) edges.push([i, j]);
  return scaleGraphFromEdges(specs, edges);
}

/** Somme des poids entre deux ensembles. */
function wBetween(g: ScaleGraph, X: number[], Y: number[]): number {
  let s = 0;
  for (const x of X) for (const y of Y) s += weightBetween(g, x, y) ?? 0;
  return s;
}

/** Lance N essais avec règle 3-facteurs pré→post, reward gaté sur "B a déchargé". */
function runVariant(stimulate: (g: ScaleGraph) => number[]): { dW: number; elig: number } {
  const g = makeGraph();
  const p: SimParams = { ...DEFAULT_PARAMS, fireFraction: 0.4, spontaneous: 0, hebbian: false, populationCap: 1e5 };
  const rng = mulberry32(1);
  const elig = new Float32Array(g.edgeCount);
  const w0AB = wBetween(g, A, B), w0AC = wBetween(g, A, C);
  let maxEligAB = 0;
  for (let trial = 0; trial < 40; trial++) {
    g.state.fill(0); g.stateNext.fill(0); g.cooldown.fill(0);
    applyInput(g, stimulate(g));
    stepScale(g, p, rng, false);
    const pre = g.stateNext, post = g.state; // PRE=T, POST=T+1
    for (let e = 0; e < g.edgeCount; e++) {
      const a = g.edgeA[e], b = g.edgeB[e];
      const causal = (pre[a] === 1 && post[b] === 1) || (pre[b] === 1 && post[a] === 1);
      elig[e] = GAMMA * elig[e] + (causal ? 1 : 0);
      if (A.includes(a) && B.includes(b)) maxEligAB = Math.max(maxEligAB, elig[e]);
    }
    const bFired = B.some((b) => post[b] === 1) ? 1 : 0; // reward gaté sur l'action "correcte"
    if (bFired) for (let e = 0; e < g.edgeCount; e++) g.edgeW[e] = Math.min(W_MAX, Math.max(0, g.edgeW[e] + ETA * bFired * elig[e]));
  }
  return { dW: (wBetween(g, A, B) - w0AB) - (wBetween(g, A, C) - w0AC), elig: maxEligAB };
}

describe("[SONDE] NO-GO plan naïf 3-facteurs", () => {
  it("ΔW(A→B vs A→C) et éligibilité restent nuls (cue-seul ET co-stim)", () => {
    const cueOnly = runVariant(() => A);
    const coStim = runVariant(() => [...A, ...B]);
    // eslint-disable-next-line no-console
    console.log(`\n[NO-GO] cue-seul : ΔW(A-B vs A-C)=${cueOnly.dW.toFixed(4)}  élig max(A-B)=${cueOnly.elig.toFixed(3)}`);
    // eslint-disable-next-line no-console
    console.log(`[NO-GO] co-stim  : ΔW(A-B vs A-C)=${coStim.dW.toFixed(4)}  élig max(A-B)=${coStim.elig.toFixed(3)}`);
    // eslint-disable-next-line no-console
    console.log(`[NO-GO] → apprentissage de contingence : ${Math.abs(cueOnly.dW) < 1e-6 && Math.abs(coStim.dW) < 1e-6 ? "AUCUN (confirmé)" : "signal détecté"}\n`);
  });
});
