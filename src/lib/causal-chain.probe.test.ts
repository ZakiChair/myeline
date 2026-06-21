import { describe, it } from "vitest";
import { step, edgeKey } from "./simulation";
import { mulberry32 } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimGraph } from "./types";

// SONDE JETABLE — verifie finding-11 (Hebb synchrone desapprend la voie causale).
// Chaine A(0) -> B(1) -> D(2), poids forts, propagation LIBRE (pas de clamp).
describe("[SONDE] Hebb synchrone vs voie causale", () => {
  it("une paire causale ne co-decharge jamais le meme tick, donc son poids decroit", () => {
    const g0: SimGraph = {
      nodes: new Map([
        [0, { state: 1, cooldown: 0, vitality: 8, sign: 1 }], // A amorce
        [1, { state: 0, cooldown: 0, vitality: 0, sign: 1 }], // B
        [2, { state: 0, cooldown: 0, vitality: 0, sign: 1 }], // D
      ]),
      adjacency: new Map([
        [0, new Set([1])],
        [1, new Set([0, 2])],
        [2, new Set([1])],
      ]),
      weights: new Map([
        [edgeKey(0, 1), 14],
        [edgeKey(1, 2), 14],
      ]),
      nextId: 3,
    };
    const p = { ...DEFAULT_PARAMS, spontaneous: 0, fireFraction: 0.16, hebbian: true, refractory: 2 };
    const rng = mulberry32(1);
    let g = g0;
    const w01: number[] = [g.weights.get(edgeKey(0, 1))!];
    const trace: string[] = [`t0 etats=[${[0, 1, 2].map((i) => g.nodes.get(i)?.state ?? "-").join(",")}]`];
    for (let t = 1; t <= 4; t++) {
      g = step(g, p, rng, false).graph;
      trace.push(`t${t} etats=[${[0, 1, 2].map((i) => g.nodes.get(i)?.state ?? "-").join(",")}]`);
      w01.push(g.weights.get(edgeKey(0, 1)) ?? 0);
    }
    // eslint-disable-next-line no-console
    console.log("[SONDE causale] " + trace.join("  |  "));
    // eslint-disable-next-line no-console
    console.log("[SONDE causale] poids A|B au fil du temps : " + w01.map((w) => w.toFixed(2)).join(" -> "));
  });
});
