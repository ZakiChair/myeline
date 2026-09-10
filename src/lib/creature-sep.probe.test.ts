import { describe, it, expect } from "vitest";
import { scaleGraphFromEdges, stepScale, type ScaleGraph } from "./scale-engine";
import { applyInput } from "./io";
import { mulberry32 } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimParams } from "./types";

// SÉPARATION D'ENTRÉE — une couche granulaire G de DÉTECTEURS DE COÏNCIDENCE
// (chaque G décharge ssi DEUX neurones de cue précis sont actifs ⇒ codage expansif
// épars, façon gyrus denté) dé-chevauche-t-elle les contextes ? Et le substrat peut-il
// EXPLOITER cette séparation (profondeur cue→G→action) ?
//
// cueL={0,1,2}, cueR={2,3,4} partagent le neurone 2 (overlap brut = 66 %).
// G = un détecteur par paire de cues (10 paires). action B,C en aval de G.

const cueL = [0, 1, 2], cueR = [2, 3, 4];
const PAIRS: Array<[number, number]> = [];
for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) PAIRS.push([i, j]);
const G = PAIRS.map((_, k) => 5 + k); // 10 neurones G : slots 5..14
const ANCHOR = [15, 16, 17, 18]; // clique silencieuse (fixe le seuil de coïncidence)
const B = [19, 20], C = [21, 22];
const N = 23;
const P: SimParams = { ...DEFAULT_PARAMS, fireFraction: 0.4, spontaneous: 0, hebbian: false, populationCap: 1e5 };
const RNG = mulberry32(0);

function makeGraph(): ScaleGraph {
  const specs = Array.from({ length: N }, () => ({ state: 0 as const }));
  const edges: Array<[number, number, number]> = [];
  // chaque G = coïncidence d'une paire de cues : 2 cues + 2 ancres ⇒ degré 4
  // (2 actifs ⇒ 2/4=0.5 ≥ φ décharge ; 1 actif ⇒ 1/4=0.25 < φ silencieux).
  // cue→G fort (14) pour que la COÏNCIDENCE domine malgré les arêtes G→action qui
  // gonflent le degré de G (sinon le dénominateur tue la détection).
  PAIRS.forEach(([a, b], k) => {
    edges.push([a, G[k], 14], [b, G[k], 14], [G[k], ANCHOR[0], 5], [G[k], ANCHOR[1], 5]);
  });
  for (let i = 0; i < ANCHOR.length; i++) for (let j = i + 1; j < ANCHOR.length; j++) edges.push([ANCHOR[i], ANCHOR[j], 5]);
  for (const g of G) for (const m of [...B, ...C]) edges.push([g, m, 5]); // G → actions
  return scaleGraphFromEdges(specs, edges);
}

/** Présente un cue, avance d'`steps` pas (cue clampé), retourne les G actifs au DERNIER pas. */
function activeG(g: ScaleGraph, cue: number[]): number[] {
  g.state.fill(0); g.stateNext.fill(0); g.cooldown.fill(0);
  applyInput(g, cue);
  stepScale(g, P, RNG, false); // tick 1 : cue → G
  return G.filter((slot) => g.state[slot] === 1);
}

function overlap(a: number[], b: number[]): number {
  const sb = new Set(b);
  const inter = a.filter((x) => sb.has(x)).length;
  return inter / Math.max(1, Math.min(a.length, b.length));
}

describe("[GATE] séparation d'entrée (couche granulaire de coïncidence)", () => {
  it("le code G dé-chevauche les contextes (overlap G ≪ overlap brut)", () => {
    const g = makeGraph();
    const gL = activeG(g, cueL), gR = activeG(g, cueR);
    const rawOverlap = overlap(cueL, cueR); // 2 partagé sur 3 = 0.66
    const gOverlap = overlap(gL, gR);
    console.log(`\n[SÉPARATION] overlap brut des cues : ${(rawOverlap * 100).toFixed(0)}%  (partagent le neurone 2)`);
    console.log(`[SÉPARATION] G actifs cueL : {${gL.join(",")}}  cueR : {${gR.join(",")}}`);
    console.log(`[SÉPARATION] overlap du code G : ${(gOverlap * 100).toFixed(0)}%  → séparation ${gOverlap < rawOverlap ? "RÉUSSIE ✅" : "échouée"}\n`);
    expect(gL.length).toBeGreaterThan(0);
    expect(gOverlap).toBeLessThan(rawOverlap);
  });

  it("MAIS la profondeur (cue→G→action) bute sur le crédit single-tick", () => {
    const g = makeGraph();
    // tick 1 : cue → G fire ; action PAS encore (2e couche = 2e tick)
    g.state.fill(0); g.stateNext.fill(0); g.cooldown.fill(0);
    applyInput(g, cueL);
    stepScale(g, P, RNG, false);
    const gFiredT1 = G.some((s) => g.state[s] === 1);
    const actFiredT1 = [...B, ...C].some((s) => g.state[s] === 1);
    // tick 2 : G (maintenant réfractaire) → action ne reçoit le relais qu'avec un délai
    applyInput(g, cueL);
    stepScale(g, P, RNG, false);
    const gRefractoryT2 = G.every((s) => g.state[s] === 0); // G a déchargé en t1 → réfractaire en t2
    console.log(`[PROFONDEUR] t1 : G déchargent=${gFiredT1}, actions déchargent=${actFiredT1} (la 2e couche a besoin d'un 2e tick)`);
    console.log(`[PROFONDEUR] t2 : G réfractaires=${gRefractoryT2} → cue→G et G→action ne sont JAMAIS co-actifs au même tick`);
    console.log(`[PROFONDEUR] → le Hebb modulé (co-activation même-tick) ne peut PAS créditer G→action : MÊME MUR que le NO-GO initial\n`);
    expect(gFiredT1).toBe(true);
    expect(actFiredT1).toBe(false); // l'action ne peut pas décharger en 1 tick à travers G
  });
});
