import { describe, it, expect } from "vitest";
import {
  createInitialGraph,
  step,
  computeStats,
  edgeList,
  edgeKey,
  DEFAULT_PARAMS,
} from "./simulation";
import { mulberry32 } from "./rng";
import type { NeuronState, NodeData, SimGraph, SimParams } from "./types";

type Spec = Record<number, { state?: NeuronState; cooldown?: number; vitality?: number; sign?: 1 | -1 }>;

function makeGraph(spec: Spec, edges: Array<[number, number]>, weight = 5): SimGraph {
  const nodes = new Map<number, NodeData>();
  const adjacency = new Map<number, Set<number>>();
  const weights = new Map<string, number>();
  let maxId = -1;
  for (const key of Object.keys(spec)) {
    const id = Number(key);
    const s = spec[id];
    nodes.set(id, { state: s.state ?? 0, cooldown: s.cooldown ?? 0, vitality: s.vitality ?? 0, sign: s.sign ?? 1 });
    adjacency.set(id, new Set<number>());
    maxId = Math.max(maxId, id);
  }
  for (const [a, b] of edges) {
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
    weights.set(edgeKey(a, b), weight);
  }
  return { nodes, adjacency, weights, nextId: maxId + 1 };
}

const params = (over: Partial<SimParams> = {}): SimParams => ({
  ...DEFAULT_PARAMS,
  populationCap: 100000,
  spontaneous: 0, // déterministe par défaut dans les tests
  ...over,
});

describe("createInitialGraph", () => {
  it("crée N neurones, sans self-loop, adjacence symétrique, états 0/1, poids posés", () => {
    const g = createInitialGraph({ ...DEFAULT_PARAMS, initialCount: 50 }, mulberry32(7));
    expect(g.nodes.size).toBe(50);
    for (const [id, set] of g.adjacency) {
      expect(set.has(id)).toBe(false);
      for (const nb of set) {
        expect(g.adjacency.get(nb)!.has(id)).toBe(true);
        expect(g.weights.has(edgeKey(id, nb))).toBe(true);
      }
    }
    for (const nd of g.nodes.values()) {
      expect(nd.state === 0 || nd.state === 1).toBe(true);
    }
  });

  it("est déterministe pour une même graine", () => {
    const a = createInitialGraph({ ...DEFAULT_PARAMS, initialCount: 30 }, mulberry32(42));
    const b = createInitialGraph({ ...DEFAULT_PARAMS, initialCount: 30 }, mulberry32(42));
    expect(edgeList(a)).toEqual(edgeList(b));
    expect([...a.nodes]).toEqual([...b.nodes]);
  });
});

describe("activité (Greenberg–Hastings)", () => {
  it("un neurone excité passe réfractaire au tick suivant", () => {
    const g = makeGraph({ 0: { state: 1 }, 1: { state: 0 } }, [[0, 1]]);
    const { graph } = step(g, params({ refractory: 2 }), mulberry32(1));
    expect(graph.nodes.get(0)!.state).toBe(0);
    expect(graph.nodes.get(0)!.cooldown).toBe(2);
  });

  it("un neurone réfractaire décrémente son cooldown sans tirer", () => {
    const g = makeGraph({ 0: { state: 0, cooldown: 2 } }, []);
    const { graph } = step(g, params(), mulberry32(1));
    expect(graph.nodes.get(0)!.state).toBe(0);
    expect(graph.nodes.get(0)!.cooldown).toBe(1);
  });

  it("décharge si la fraction de voisins excités ≥ φ, et la vitalité monte", () => {
    const g = makeGraph(
      { 0: { state: 0, vitality: 0 }, 1: { state: 1 }, 2: { state: 1 }, 3: { state: 0 }, 4: { state: 0 } },
      [[0, 1], [0, 2], [0, 3], [0, 4]],
    );
    const { graph } = step(g, params({ fireFraction: 0.4 }), mulberry32(1));
    expect(graph.nodes.get(0)!.state).toBe(1); // 2/4 = 0.5 ≥ 0.4
    expect(graph.nodes.get(0)!.vitality).toBe(8); // +VIT_GAIN
  });

  it("ne décharge pas sous le seuil, et la vitalité décroît", () => {
    const g = makeGraph(
      { 0: { state: 0, vitality: 5 }, 1: { state: 1 }, 2: { state: 0 }, 3: { state: 0 }, 4: { state: 0 } },
      [[0, 1], [0, 2], [0, 3], [0, 4]],
    );
    const { graph } = step(g, params({ fireFraction: 0.4 }), mulberry32(1));
    expect(graph.nodes.get(0)!.state).toBe(0); // 1/4 = 0.25 < 0.4
    expect(graph.nodes.get(0)!.vitality).toBe(4); // −1
  });

  it("renforce les synapses co-excitées, affaiblit les autres (Hebb)", () => {
    const g = makeGraph(
      { 0: { state: 1 }, 1: { state: 1 }, 2: { state: 1 }, 3: { state: 0 } },
      [[0, 1], [2, 3]],
      5,
    );
    const { graph } = step(g, params({ hebbian: true }), mulberry32(1));
    expect(graph.weights.get(edgeKey(0, 1))!).toBeGreaterThan(5); // co-excités
    expect(graph.weights.get(edgeKey(2, 3))!).toBeLessThan(5); // non co-actifs
  });

  it("ne mute pas le graphe d'entrée", () => {
    const g = makeGraph({ 0: { state: 1 }, 1: { state: 0 } }, [[0, 1]]);
    step(g, params(), mulberry32(1));
    expect(g.nodes.get(0)!.state).toBe(1);
    expect(g.nodes.get(0)!.cooldown).toBe(0);
  });
});

describe("décharge pondérée (Palier 1)", () => {
  it("un voisin excité de poids fort fait décharger là où la fraction brute ne le ferait pas", () => {
    const g = makeGraph(
      { 0: { state: 0, vitality: 0 }, 1: { state: 1 }, 2: { state: 0 }, 3: { state: 0 }, 4: { state: 0 } },
      [[0, 1], [0, 2], [0, 3], [0, 4]],
    );
    g.weights.set(edgeKey(0, 1), 14); // synapse forte vers le voisin excité
    g.weights.set(edgeKey(0, 2), 1);
    g.weights.set(edgeKey(0, 3), 1);
    g.weights.set(edgeKey(0, 4), 1);
    const { graph } = step(g, params({ fireFraction: 0.4 }), mulberry32(1));
    // pondéré : 14/17 ≈ 0.82 ≥ 0.4 → décharge (brut 1/4 = 0.25 < 0.4 ne déchargerait pas).
    expect(graph.nodes.get(0)!.state).toBe(1);
  });

  it("des voisins excités de poids faible n'atteignent pas le seuil même si la fraction brute le dépasse", () => {
    const g = makeGraph(
      { 0: { state: 0, vitality: 0 }, 1: { state: 1 }, 2: { state: 1 }, 3: { state: 0 }, 4: { state: 0 } },
      [[0, 1], [0, 2], [0, 3], [0, 4]],
    );
    g.weights.set(edgeKey(0, 1), 1);
    g.weights.set(edgeKey(0, 2), 1);
    g.weights.set(edgeKey(0, 3), 14); // synapses fortes vers des voisins au repos
    g.weights.set(edgeKey(0, 4), 14);
    const { graph } = step(g, params({ fireFraction: 0.4 }), mulberry32(1));
    // pondéré : 2/30 ≈ 0.067 < 0.4 → pas de décharge (brut 2/4 = 0.5 ≥ 0.4 déchargerait).
    expect(graph.nodes.get(0)!.state).toBe(0);
  });
});

describe("inhibition / loi de Dale (Palier 1)", () => {
  it("un voisin excité INHIBITEUR soustrait au drive et empêche la décharge", () => {
    const g = makeGraph(
      { 0: { state: 0, vitality: 0 }, 1: { state: 1 }, 2: { state: 1, sign: -1 }, 3: { state: 0 }, 4: { state: 0 } },
      [[0, 1], [0, 2], [0, 3], [0, 4]],
    );
    const { graph } = step(g, params({ fireFraction: 0.4 }), mulberry32(1));
    // net = (5 − 5)/20 = 0 < 0.4 → pas de décharge (tout excitateur : 0.5 ≥ 0.4 → décharge).
    expect(graph.nodes.get(0)!.state).toBe(0);
  });

  it("createInitialGraph assigne ~20% d'inhibiteurs (déterministe) à inhibRatio=0.2", () => {
    const g = createInitialGraph({ ...DEFAULT_PARAMS, initialCount: 100, inhibRatio: 0.2 }, mulberry32(7));
    let inhib = 0;
    for (const nd of g.nodes.values()) if (nd.sign === -1) inhib++;
    expect(inhib).toBe(20);
  });

  it("tout excitateur à inhibRatio=0 (défaut)", () => {
    const g = createInitialGraph({ ...DEFAULT_PARAMS, initialCount: 40 }, mulberry32(7));
    for (const nd of g.nodes.values()) expect(nd.sign).toBe(1);
  });

  it("l'enfant hérite du signe du parent à la naissance", () => {
    const edges: Array<[number, number]> = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]];
    const spec: Spec = { 0: { state: 0, vitality: 18, sign: -1 } }; // parent inhibiteur
    for (let i = 1; i <= 6; i++) spec[i] = { state: 0, vitality: 5 };
    const { graph, events } = step(makeGraph(spec, edges), params({ hebbian: false }), mulberry32(2), true);
    expect(events.born).toHaveLength(1);
    expect(graph.nodes.get(events.born[0].id)!.sign).toBe(-1); // hérité du parent
  });
});

describe("plafond de population (déblocage > 400)", () => {
  it("avec le plafond par défaut, la population peut croître bien au-delà de 400", () => {
    const p = { ...DEFAULT_PARAMS, initialCount: 120 }; // populationCap hérité du défaut
    let g = createInitialGraph(p, mulberry32(3));
    const rng = mulberry32(7);
    let peak = g.nodes.size;
    for (let t = 1; t <= 400; t++) {
      g = step(g, p, rng, t % p.developEvery === 0).graph;
      peak = Math.max(peak, g.nodes.size);
    }
    expect(peak).toBeGreaterThan(400);
  });
});

describe("garde de régime (Palier 1) — ni extinction ni saturation", () => {
  it("reste dans le régime avalanches sur une longue série sous plasticité + poids différenciés", () => {
    // Poids non uniformes (Hebb actif) → la décharge pondérée pourrait dériver vers
    // strobe ou extinction. Cette garde fige le régime cible (cf. badge StatsPanel).
    const p = { ...DEFAULT_PARAMS, initialCount: 150, hebbian: true }; // spontaneous=0.02 par défaut
    let g = createInitialGraph(p, mulberry32(7));
    const rng = mulberry32(123);
    const fracs: number[] = [];
    for (let t = 1; t <= 120; t++) {
      g = step(g, p, rng, t % p.developEvery === 0).graph;
      const s = computeStats(g, t);
      expect(s.total).toBeGreaterThan(0); // jamais d'extinction totale de population
      fracs.push(s.excited / s.total);
    }
    const tail = fracs.slice(-60);
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    const peak = Math.max(...tail);
    expect(mean).toBeGreaterThan(0.01); // pas silencieux (activité maintenue)
    expect(mean).toBeLessThan(0.5); // pas saturé en moyenne (< seuil "saturé" = 42 %)
    expect(peak).toBeLessThan(0.9); // pas de strobe plein écran
  });
});

describe("développement (horloge lente)", () => {
  it("tue un neurone silencieux (vitalité 0) et faiblement connecté", () => {
    const g = makeGraph({ 0: { state: 0, vitality: 0 }, 1: { state: 0, vitality: 10 } }, [[0, 1]]);
    const { graph, events } = step(g, params(), mulberry32(1), true);
    expect(graph.nodes.has(0)).toBe(false);
    expect(events.died).toContain(0);
    expect(graph.nodes.has(1)).toBe(true); // vitalité > 0 ⇒ survit
  });

  it("fait naître un enfant d'un hub très actif (relié parent + voisins)", () => {
    const edges: Array<[number, number]> = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]];
    const spec: Spec = { 0: { state: 0, vitality: 18 } };
    for (let i = 1; i <= 6; i++) spec[i] = { state: 0, vitality: 5 }; // survivent
    const { graph, events } = step(makeGraph(spec, edges), params({ hebbian: false }), mulberry32(2), true);

    expect(events.born).toHaveLength(1);
    const child = events.born[0].id;
    expect(events.born[0].parentId).toBe(0);
    expect(graph.nodes.get(child)!.state).toBe(1);
    expect(graph.adjacency.get(child)!.size).toBe(7); // 6 voisins + parent
    expect(graph.adjacency.get(child)!.has(0)).toBe(true);
  });

  it("suspend les naissances au plafond", () => {
    const edges: Array<[number, number]> = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]];
    const spec: Spec = { 0: { state: 0, vitality: 18 } };
    for (let i = 1; i <= 6; i++) spec[i] = { state: 0, vitality: 5 };
    const { events } = step(makeGraph(spec, edges), params({ hebbian: false, populationCap: 7 }), mulberry32(2), true);
    expect(events.born).toHaveLength(0);
  });

  it("élague les synapses dont le poids a décru (use-it-or-lose-it)", () => {
    const g = makeGraph(
      { 0: { state: 0, vitality: 10 }, 1: { state: 0, vitality: 10 }, 2: { state: 0, vitality: 10 } },
      [[0, 1], [1, 2]],
      0.2, // sous le seuil après décroissance
    );
    const { graph, events } = step(g, params({ hebbian: true }), mulberry32(1), true);
    expect(events.droppedEdges.length).toBeGreaterThan(0);
    expect(graph.adjacency.get(0)!.has(1)).toBe(false);
  });

  it("est déterministe pour une même graine", () => {
    const a = createInitialGraph({ ...DEFAULT_PARAMS, initialCount: 40 }, mulberry32(11));
    const b = createInitialGraph({ ...DEFAULT_PARAMS, initialCount: 40 }, mulberry32(11));
    const r1 = step(a, params(), mulberry32(99), true);
    const r2 = step(b, params(), mulberry32(99), true);
    expect(edgeList(r1.graph)).toEqual(edgeList(r2.graph));
    expect([...r1.graph.nodes]).toEqual([...r2.graph.nodes]);
  });
});

describe("computeStats", () => {
  it("compte vivants, excités, liaisons et degré moyen", () => {
    const g = makeGraph({ 0: { state: 1 }, 1: { state: 0 }, 2: { state: 1 } }, [[0, 1], [1, 2]]);
    const s = computeStats(g, 3);
    expect(s.generation).toBe(3);
    expect(s.total).toBe(3);
    expect(s.excited).toBe(2);
    expect(s.links).toBe(2);
    expect(s.avgDegree).toBeCloseTo(4 / 3);
  });
});
