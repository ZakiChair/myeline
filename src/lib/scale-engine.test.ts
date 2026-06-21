import { describe, it, expect } from "vitest";
import {
  scaleGraphFromEdges,
  createScaleGraph,
  stepScale,
  scaleStats,
  degreeOf,
  neighborSlots,
  weightBetween,
  type ScaleGraph,
} from "./scale-engine";
import { mulberry32 } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { NeuronState, SimParams } from "./types";

type Spec = { state?: NeuronState; cooldown?: number; vitality?: number };
type Edge = [number, number] | [number, number, number];

const params = (over: Partial<SimParams> = {}): SimParams => ({
  ...DEFAULT_PARAMS,
  populationCap: 100000,
  spontaneous: 0,
  ...over,
});

// Liste des arêtes non orientées vivantes (slot a < slot b) avec poids.
function liveEdges(g: ScaleGraph): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < g.capacity; i++) {
    if (!g.alive[i]) continue;
    for (const j of neighborSlots(g, i)) {
      if (i < j) out.push([i, j, weightBetween(g, i, j) ?? 0]);
    }
  }
  return out.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

describe("createScaleGraph", () => {
  it("crée N neurones, sans self-loop, adjacence symétrique, états 0/1, positions finies", () => {
    const g = createScaleGraph({ ...DEFAULT_PARAMS, initialCount: 60 }, mulberry32(7));
    expect(g.count).toBe(60);
    for (let i = 0; i < 60; i++) {
      expect(g.state[i] === 0 || g.state[i] === 1).toBe(true);
      expect(Number.isFinite(g.posX[i])).toBe(true);
      expect(Number.isFinite(g.posY[i])).toBe(true);
      expect(Number.isFinite(g.posZ[i])).toBe(true);
      const nb = neighborSlots(g, i);
      expect(nb).not.toContain(i); // pas de self-loop
      for (const j of nb) {
        expect(neighborSlots(g, j)).toContain(i); // symétrie
      }
    }
  });

  it("est déterministe pour une même graine", () => {
    const a = createScaleGraph({ ...DEFAULT_PARAMS, initialCount: 40 }, mulberry32(42));
    const b = createScaleGraph({ ...DEFAULT_PARAMS, initialCount: 40 }, mulberry32(42));
    expect(liveEdges(a)).toEqual(liveEdges(b));
    expect(Array.from(a.state.slice(0, 40))).toEqual(Array.from(b.state.slice(0, 40)));
  });
});

describe("activité (Greenberg–Hastings)", () => {
  it("un neurone excité passe réfractaire au tick suivant", () => {
    const g = scaleGraphFromEdges([{ state: 1 }, { state: 0 }], [[0, 1]]);
    stepScale(g, params({ refractory: 2 }), mulberry32(1));
    expect(g.state[0]).toBe(0);
    expect(g.cooldown[0]).toBe(2);
  });

  it("un neurone réfractaire décrémente son cooldown sans tirer", () => {
    const g = scaleGraphFromEdges([{ state: 0, cooldown: 2 }], []);
    stepScale(g, params(), mulberry32(1));
    expect(g.state[0]).toBe(0);
    expect(g.cooldown[0]).toBe(1);
  });

  it("décharge si la fraction de voisins excités ≥ φ, et la vitalité monte", () => {
    const g = scaleGraphFromEdges(
      [{ state: 0, vitality: 0 }, { state: 1 }, { state: 1 }, { state: 0 }, { state: 0 }],
      [[0, 1], [0, 2], [0, 3], [0, 4]],
    );
    stepScale(g, params({ fireFraction: 0.4 }), mulberry32(1));
    expect(g.state[0]).toBe(1); // 2/4 = 0.5 ≥ 0.4
    expect(g.vitality[0]).toBe(8); // +VIT_GAIN
  });

  it("ne décharge pas sous le seuil, et la vitalité décroît", () => {
    const g = scaleGraphFromEdges(
      [{ state: 0, vitality: 5 }, { state: 1 }, { state: 0 }, { state: 0 }, { state: 0 }],
      [[0, 1], [0, 2], [0, 3], [0, 4]],
    );
    stepScale(g, params({ fireFraction: 0.4 }), mulberry32(1));
    expect(g.state[0]).toBe(0); // 1/4 = 0.25 < 0.4
    expect(g.vitality[0]).toBe(4); // −1
  });

  it("renforce les synapses co-excitées, affaiblit les autres (Hebb)", () => {
    const g = scaleGraphFromEdges(
      [{ state: 1 }, { state: 1 }, { state: 1 }, { state: 0 }],
      [[0, 1], [2, 3]],
    );
    stepScale(g, params({ hebbian: true }), mulberry32(1));
    expect(weightBetween(g, 0, 1)!).toBeGreaterThan(5); // co-excités
    expect(weightBetween(g, 2, 3)!).toBeLessThan(5); // non co-actifs
  });

  it("est déterministe pour une même graine et un même graphe", () => {
    const a = createScaleGraph({ ...DEFAULT_PARAMS, initialCount: 40 }, mulberry32(11));
    const b = createScaleGraph({ ...DEFAULT_PARAMS, initialCount: 40 }, mulberry32(11));
    stepScale(a, params(), mulberry32(99), true);
    stepScale(b, params(), mulberry32(99), true);
    expect(liveEdges(a)).toEqual(liveEdges(b));
    expect(Array.from(a.state.slice(0, a.capacity))).toEqual(Array.from(b.state.slice(0, b.capacity)));
  });
});

describe("décharge pondérée (Palier 1)", () => {
  it("un voisin excité de poids fort fait décharger là où la fraction brute ne le ferait pas", () => {
    const g = scaleGraphFromEdges(
      [{ state: 0, vitality: 0 }, { state: 1 }, { state: 0 }, { state: 0 }, { state: 0 }],
      [[0, 1, 14], [0, 2, 1], [0, 3, 1], [0, 4, 1]],
    );
    stepScale(g, params({ fireFraction: 0.4 }), mulberry32(1));
    // pondéré : 14/17 ≈ 0.82 ≥ 0.4 → décharge (brut 1/4 = 0.25 < 0.4 ne déchargerait pas).
    expect(g.state[0]).toBe(1);
  });

  it("des voisins excités de poids faible n'atteignent pas le seuil même si la fraction brute le dépasse", () => {
    const g = scaleGraphFromEdges(
      [{ state: 0, vitality: 0 }, { state: 1 }, { state: 1 }, { state: 0 }, { state: 0 }],
      [[0, 1, 1], [0, 2, 1], [0, 3, 14], [0, 4, 14]],
    );
    stepScale(g, params({ fireFraction: 0.4 }), mulberry32(1));
    // pondéré : 2/30 ≈ 0.067 < 0.4 → pas de décharge (brut 2/4 = 0.5 ≥ 0.4 déchargerait).
    expect(g.state[0]).toBe(0);
  });
});

describe("inhibition / loi de Dale (Palier 1)", () => {
  it("un voisin excité INHIBITEUR soustrait au drive et empêche la décharge", () => {
    // Neurone 0 : voisins 1,2 excités, 3,4 au repos. φ=0.4, poids uniformes 5.
    const g = scaleGraphFromEdges(
      [{ state: 0, vitality: 0 }, { state: 1 }, { state: 1 }, { state: 0 }, { state: 0 }],
      [[0, 1], [0, 2], [0, 3], [0, 4]],
    );
    g.sign[2] = -1; // le voisin 2 devient inhibiteur
    stepScale(g, params({ fireFraction: 0.4 }), mulberry32(1));
    // net = (5 − 5)/20 = 0 < 0.4 → pas de décharge (en tout excitateur : 10/20 = 0.5 ≥ 0.4 → décharge).
    expect(g.state[0]).toBe(0);
  });

  it("reste excitateur par défaut : un voisin excité (+1) rapproche du seuil", () => {
    const g = scaleGraphFromEdges(
      [{ state: 0, vitality: 0 }, { state: 1 }, { state: 1 }, { state: 0 }, { state: 0 }],
      [[0, 1], [0, 2], [0, 3], [0, 4]],
    );
    stepScale(g, params({ fireFraction: 0.4 }), mulberry32(1));
    expect(g.state[0]).toBe(1); // 10/20 = 0.5 ≥ 0.4
  });

  it("createScaleGraph assigne ~20% d'inhibiteurs (déterministe) à inhibRatio=0.2", () => {
    const g = createScaleGraph({ ...DEFAULT_PARAMS, initialCount: 100, inhibRatio: 0.2 }, mulberry32(7));
    let inhib = 0;
    for (let i = 0; i < 100; i++) if (g.sign[i] === -1) inhib++;
    expect(inhib).toBe(20);
  });

  it("createScaleGraph : tout excitateur à inhibRatio=0 (défaut)", () => {
    const g = createScaleGraph({ ...DEFAULT_PARAMS, initialCount: 50 }, mulberry32(7));
    for (let i = 0; i < 50; i++) expect(g.sign[i]).toBe(1);
  });

  it("l'enfant hérite du signe du parent à la naissance", () => {
    const edges: Edge[] = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]];
    const specs: Spec[] = [{ state: 0, vitality: 18 }];
    for (let i = 1; i <= 6; i++) specs.push({ state: 0, vitality: 5 });
    const g = scaleGraphFromEdges(specs, edges, 16);
    g.sign[0] = -1; // parent inhibiteur
    const { events } = stepScale(g, params({ hebbian: false }), mulberry32(2), true);
    expect(events.born.length).toBe(1);
    expect(g.sign[events.born[0]]).toBe(-1); // hérité du parent
  });
});

describe("décharge directionnelle (rework arêtes orientées, inc.1)", () => {
  // Graphe : 0(A)─1(B), + distracteur 2 sur A, distracteur 3 sur B. Arête 0 = (0,1).
  // edgeW[0] = sens A→B (0→1) ; edgeWb[0] = sens B→A (1→0).
  function makeDirectional() {
    const g = scaleGraphFromEdges(
      [{ state: 0 }, { state: 0 }, { state: 0 }, { state: 0 }],
      [[0, 1], [0, 2], [1, 3]],
    );
    g.edgeW[0] = 14; // A→B fort
    g.edgeWb[0] = 1; // B→A faible
    return g;
  }

  it("sens AVANT : A excité (poids A→B=14) fait décharger B", () => {
    const g = makeDirectional();
    g.state[0] = 1; // A excité (sans clamp réfractaire, on lit l'effet sur B)
    stepScale(g, params({ fireFraction: 0.4 }), mulberry32(1));
    expect(g.state[1]).toBe(1); // drive 14/(14+5)=0.74 ≥ 0.4
  });

  it("sens ARRIÈRE : B excité (poids B→A=1 faible) ne fait PAS décharger A", () => {
    const g = makeDirectional();
    g.state[1] = 1; // B excité
    stepScale(g, params({ fireFraction: 0.4 }), mulberry32(1));
    // directionnel : drive sur A = edgeWb=1 → 1/(1+5)=0.17 < 0.4 → pas de décharge.
    // (symétrique, le bug : utiliserait edgeW=14 → 14/19=0.74 → A déchargerait.)
    expect(g.state[0]).toBe(0);
  });

  it("STDP (opt-in) renforce le sens causal A→B et affaiblit le sens inverse", () => {
    // A(0) excité à t-1 ; B(1) décharge à t (par propagation) ⇒ A→B causal.
    const g = scaleGraphFromEdges([{ state: 1 }, { state: 0 }], [[0, 1]]);
    stepScale(g, params({ fireFraction: 0.4, plasticity: "stdp" }), mulberry32(1));
    expect(g.state[1]).toBe(1); // B a bien déchargé depuis A
    expect(g.edgeW[0]).toBeGreaterThan(5); // sens A→B renforcé (LTP)
    expect(g.edgeWb[0]).toBeLessThan(5); // sens B→A affaibli (LTD)
  });

  it("inc.3 : un tick de développement PRÉSERVE l'asymétrie directionnelle (edgeWb ≠ edgeW)", () => {
    // Arête 0=(0,1) asymétrique ; vitalité haute ⇒ pas de mort ; hebbian off ⇒ l'activité
    // ne touche pas les poids. Avant le fix, buildTopology remettait edgeWb=edgeW au dev.
    const g = scaleGraphFromEdges([{ state: 0, vitality: 10 }, { state: 0, vitality: 10 }], [[0, 1]]);
    g.edgeW[0] = 12;
    g.edgeWb[0] = 1;
    stepScale(g, params({ hebbian: false }), mulberry32(1), true); // tick de développement
    expect(g.alive[0]).toBe(1);
    expect(g.alive[1]).toBe(1);
    expect(weightBetween(g, 0, 1)).toBeCloseTo(12); // sens avant intact
    // L'arête survit et garde son asymétrie au lieu d'être remise symétrique.
    const e = g.edgeIdOf[g.offsets[0]];
    expect(g.edgeW[e]).toBeCloseTo(12);
    expect(g.edgeWb[e]).toBeCloseTo(1); // ≠ 12 ⇒ asymétrie préservée
  });

  it("inc.4 : le clamp de SORTIE force stateNext et entraîne la STDP même sous le seuil", () => {
    // A(0)→B(1), φ élevé ⇒ A seul ne fait PAS décharger B. A excité à t-1, B clampé à t
    // ⇒ STDP voit pré(A)→post(B) et renforce A→B malgré le drive sous-seuil.
    const g = scaleGraphFromEdges([{ state: 1 }, { state: 0 }], [[0, 1]]);
    stepScale(g, params({ fireFraction: 0.9, plasticity: "stdp" }), mulberry32(1), false, [1]);
    expect(g.state[1]).toBe(1); // B forcé par le clamp
    expect(g.edgeW[0]).toBeGreaterThan(5); // sens A→B renforcé (LTP) grâce au clamp
  });
});

describe("développement (horloge lente)", () => {
  it("tue un neurone silencieux (vitalité 0) et faiblement connecté", () => {
    const g = scaleGraphFromEdges(
      [{ state: 0, vitality: 0 }, { state: 0, vitality: 10 }],
      [[0, 1]],
    );
    const { events } = stepScale(g, params(), mulberry32(1), true);
    expect(g.alive[0]).toBe(0);
    expect(events.died).toContain(0);
    expect(g.alive[1]).toBe(1); // vitalité > 0 ⇒ survit
  });

  it("fait naître un enfant d'un hub très actif (relié parent + voisins)", () => {
    const edges: Edge[] = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]];
    const specs: Spec[] = [{ state: 0, vitality: 18 }];
    for (let i = 1; i <= 6; i++) specs.push({ state: 0, vitality: 5 });
    const g = scaleGraphFromEdges(specs, edges, 16);
    const { events } = stepScale(g, params({ hebbian: false }), mulberry32(2), true);

    expect(events.born.length).toBe(1);
    const child = events.born[0];
    expect(g.alive[child]).toBe(1);
    expect(g.state[child]).toBe(1);
    expect(degreeOf(g, child)).toBe(7); // 6 voisins + parent
    expect(neighborSlots(g, child)).toContain(0);
  });

  it("suspend les naissances au plafond", () => {
    const edges: Edge[] = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]];
    const specs: Spec[] = [{ state: 0, vitality: 18 }];
    for (let i = 1; i <= 6; i++) specs.push({ state: 0, vitality: 5 });
    const g = scaleGraphFromEdges(specs, edges, 16);
    const { events } = stepScale(g, params({ hebbian: false, populationCap: 7 }), mulberry32(2), true);
    expect(events.born.length).toBe(0);
  });

  it("élague les synapses dont le poids a décru (use-it-or-lose-it)", () => {
    const g = scaleGraphFromEdges(
      [{ state: 0, vitality: 10 }, { state: 0, vitality: 10 }, { state: 0, vitality: 10 }],
      [[0, 1, 0.2], [1, 2, 0.2]], // poids sous le seuil après décroissance
    );
    const { events } = stepScale(g, params({ hebbian: true }), mulberry32(1), true);
    expect(events.droppedEdges).toBeGreaterThan(0);
    expect(neighborSlots(g, 0)).not.toContain(1);
  });
});

describe("scaleStats", () => {
  it("compte vivants, excités, liaisons et degré moyen", () => {
    const g = scaleGraphFromEdges(
      [{ state: 1 }, { state: 0 }, { state: 1 }],
      [[0, 1], [1, 2]],
    );
    const s = scaleStats(g, 3);
    expect(s.generation).toBe(3);
    expect(s.total).toBe(3);
    expect(s.excited).toBe(2);
    expect(s.links).toBe(2);
    expect(s.avgDegree).toBeCloseTo(4 / 3);
  });
});
