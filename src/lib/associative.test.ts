import { describe, it, expect } from "vitest";
import { scaleGraphFromEdges, stepScale, type ScaleGraph } from "./scale-engine";
import { applyInput } from "./io";
import { mulberry32 } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimParams } from "./types";

// MÉMOIRE ASSOCIATIVE (Palier 2) — « assemblée de Hebb » sur le moteur Échelle.
//
// Rappel : le réfractaire interdit un attracteur statique. Le rappel est donc une
// PROPAGATION APPRISE : stimuler A déclenche une onde qui recrute B ~1 tick après,
// SI l'entraînement a renforcé les synapses A↔B.
//
// Témoin apparié C : topologie IDENTIQUE à B (relié aux 2 neurones de A + 4 ballast).
// Seule différence : A∪B est co-stimulé à l'entraînement, jamais C. Métrique
// différentielle Δ = P(B décharge | A) − P(C décharge | A), spontaneous=0 (déterministe).
//
// Neurones : A={0,1}, B={2,3}, C={4,5}, ballast P={6..13} (clique, jamais stimulée,
// fournit du dénominateur de poids sans jamais décharger → la décharge pondérée discrimine).

const A = [0, 1];
const B = [2, 3];
const C = [4, 5];

function makeAssocGraph(): ScaleGraph {
  const specs = Array.from({ length: 14 }, () => ({ state: 0 as const }));
  const edges: Array<[number, number]> = [];
  // A ↔ B et A ↔ C (mêmes poids initiaux → B et C partent identiques).
  for (const a of A) for (const b of B) edges.push([a, b]);
  for (const a of A) for (const c of C) edges.push([a, c]);
  // Ballast : b0/c0 partagent {6,7,8,9} ; b1/c1 partagent {10,11,12,13}.
  for (const n of [2, 4]) for (const p of [6, 7, 8, 9]) edges.push([n, p]);
  for (const n of [3, 5]) for (const p of [10, 11, 12, 13]) edges.push([n, p]);
  // Clique P (toujours au repos → ne décharge jamais, stabilise le dénominateur).
  for (let i = 6; i <= 13; i++) for (let j = i + 1; j <= 13; j++) edges.push([i, j]);
  return scaleGraphFromEdges(specs, edges); // poids = W_INIT par défaut
}

/** Stimule `cue`, avance d'un tick, retourne la fraction de `readSet` qui décharge. */
function recallFraction(g: ScaleGraph, p: SimParams, cue: number[], readSet: number[]): number {
  g.state.fill(0);
  g.stateNext.fill(0);
  g.cooldown.fill(0);
  applyInput(g, cue);
  stepScale(g, p, mulberry32(1), false); // spontaneous=0 ⇒ rng non consommé
  return readSet.reduce((acc, s) => acc + g.state[s], 0) / readSet.length;
}

describe("mémoire associative (Palier 2)", () => {
  const p: SimParams = { ...DEFAULT_PARAMS, fireFraction: 0.4, spontaneous: 0, populationCap: 100000 };

  it("avant entraînement, stimuler A ne recrute NI B NI C (pas d'asymétrie structurelle)", () => {
    const g = makeAssocGraph();
    const deltaBefore = recallFraction(g, p, A, B) - recallFraction(g, p, A, C);
    expect(Math.abs(deltaBefore)).toBeLessThanOrEqual(0.05);
  });

  it("après entraînement de A∪B, stimuler A recrute B mais pas le témoin C", () => {
    const g = makeAssocGraph();
    // Entraînement : co-stimulation répétée de A∪B (clamp par ré-injection / tick).
    for (let t = 0; t < 24; t++) {
      applyInput(g, [...A, ...B]);
      stepScale(g, p, mulberry32(1), false);
    }
    const pB = recallFraction(g, p, A, B);
    const pC = recallFraction(g, p, A, C);
    const delta = pB - pC;
    // eslint-disable-next-line no-console
    console.log(`[Palier 2] rappel A→  P(B)=${pB.toFixed(2)}  P(C)=${pC.toFixed(2)}  Δ=${delta.toFixed(2)}`);
    expect(pB).toBeGreaterThanOrEqual(0.5); // B recruté
    expect(pC).toBeLessThanOrEqual(0.1); // témoin C silencieux
    expect(delta).toBeGreaterThanOrEqual(0.5); // apprentissage spécifique
  });
});
