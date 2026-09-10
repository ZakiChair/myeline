// Moteur de simulation Myéline — logique PURE, sans dépendance au rendu.
//
// ACTIVITÉ (horloge rapide, chaque tick) — automate excitable Greenberg–Hastings :
//   repos      : décharge si (fraction de voisins excités ≥ φ) OU étincelle (proba p)
//   excité     : devient réfractaire au tick suivant
//   réfractaire: attend R ticks, puis repos
//   vitalité   : +VIT_GAIN à chaque décharge, −1 sinon (intègre l'activité récente)
//   poids      : paires co-excitées renforcées, sinon décroissance (Hebb / STDP simplifié)
//
// DÉVELOPPEMENT (horloge lente, tous les developEvery ticks) :
//   mort       : vitalité nulle (silencieux longtemps) ET degré < surviveThreshold
//   naissance  : vitalité élevée ET degré ≥ birthThreshold → enfant (parent + voisins)
//   synaptogenèse : hub actif → nouvelle liaison vers un voisin-de-voisin (si degré < maxDegree)
//   élagage    : liaisons de poids quasi nul retirées (use-it-or-lose-it)

import type {
  SimGraph,
  SimParams,
  Stats,
  TickEvents,
  NodeData,
  NeuronState,
} from "./types";
import type { RNG } from "./rng";
import { randInt } from "./rng";
import {
  VIT_GAIN,
  VIT_MAX,
  VIT_BIRTH,
  VIT_SYNAPTO,
  W_INIT,
  W_UP,
  W_DOWN,
  W_MAX,
  W_PRUNE,
  DEFAULT_PARAMS,
  firesByThreshold,
  isInhibitory,
} from "./rules";

// Constantes et paramètres par défaut partagés (cf. rules.ts), réexportés ici
// pour préserver les imports existants (`import { DEFAULT_PARAMS } from "@/lib/simulation"`).
export { DEFAULT_PARAMS };

/** Clé d'arête non orientée canonique. */
export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function cloneAdjacency(adj: Map<number, Set<number>>): Map<number, Set<number>> {
  const copy = new Map<number, Set<number>>();
  for (const [id, set] of adj) copy.set(id, new Set(set));
  return copy;
}

function shuffleInPlace<T>(arr: T[], rng: RNG): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function sampleDistinct(rng: RNG, n: number, exclude: number, count: number): number[] {
  const pool: number[] = [];
  for (let i = 0; i < n; i++) if (i !== exclude) pool.push(i);
  const c = Math.min(count, pool.length);
  for (let i = 0; i < c; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, c);
}

/** Crée le graphe initial : N neurones, liaisons aléatoires, fraction excitée = activeRatio. */
export function createInitialGraph(params: SimParams, rng: RNG): SimGraph {
  const n = Math.max(0, Math.floor(params.initialCount));
  const nodes = new Map<number, NodeData>();
  const adjacency = new Map<number, Set<number>>();

  for (let i = 0; i < n; i++) {
    const state: NeuronState = rng() < params.activeRatio ? 1 : 0;
    const sign: 1 | -1 = isInhibitory(i, params.inhibRatio) ? -1 : 1;
    nodes.set(i, { state, cooldown: 0, vitality: state === 1 ? VIT_GAIN : 0, sign });
    adjacency.set(i, new Set<number>());
  }

  const maxLinks = Math.min(params.maxInitialLinks, Math.max(0, n - 1));
  const minLinks = Math.max(0, Math.min(params.minInitialLinks, maxLinks));
  const weights = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const k = maxLinks <= 0 ? 0 : randInt(rng, minLinks, maxLinks);
    for (const j of sampleDistinct(rng, n, i, k)) {
      adjacency.get(i)!.add(j);
      adjacency.get(j)!.add(i);
      weights.set(edgeKey(i, j), W_INIT);
    }
  }

  return { nodes, adjacency, weights, nextId: n };
}

/** Choisit un voisin-de-voisin de `id`, non déjà connecté. */
function pickTwoHop(
  adj: Map<number, Set<number>>,
  id: number,
  rng: RNG,
): number | null {
  const neighbors = Array.from(adj.get(id)!);
  if (neighbors.length === 0) return null;
  const n1 = neighbors[Math.floor(rng() * neighbors.length)];
  const own = adj.get(id)!;
  const candidates = Array.from(adj.get(n1)!).filter((x) => x !== id && !own.has(x));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * Applique un tick. `develop` active l'horloge lente (mort/naissance/câblage).
 * Retourne un NOUVEAU graphe (entrée non mutée) et les événements.
 */
export function step(
  graph: SimGraph,
  params: SimParams,
  rng: RNG,
  develop = false,
): { graph: SimGraph; events: TickEvents } {
  const events: TickEvents = {
    born: [],
    died: [],
    droppedEdges: [],
    newEdges: [],
    excited: 0,
  };

  // ───────── ACTIVITÉ ─────────
  const newNodes = new Map<number, NodeData>();
  for (const [id, nd] of graph.nodes) {
    const neighbors = graph.adjacency.get(id)!;
    // Drive NET signé (loi de Dale) : Σ signe·w des voisins excités / Σ|w| (cf.
    // firesByThreshold). Un voisin excitateur (+1) rapproche du seuil, un inhibiteur (-1) l'en éloigne.
    let netWeight = 0;
    let totalWeight = 0;
    for (const nb of neighbors) {
      const w = graph.weights.get(edgeKey(id, nb)) ?? W_INIT;
      totalWeight += w;
      const nbNode = graph.nodes.get(nb)!;
      if (nbNode.state === 1) netWeight += nbNode.sign * w;
    }

    let nextState: NeuronState;
    let nextCooldown: number;
    if (nd.cooldown > 0) {
      nextState = 0;
      nextCooldown = nd.cooldown - 1;
    } else if (nd.state === 1) {
      nextState = 0;
      nextCooldown = params.refractory;
    } else {
      const fires =
        firesByThreshold(netWeight, totalWeight, params.fireFraction) ||
        rng() < params.spontaneous;
      nextState = fires ? 1 : 0;
      nextCooldown = 0;
    }

    const vitality =
      nextState === 1
        ? Math.min(VIT_MAX, nd.vitality + VIT_GAIN)
        : Math.max(0, nd.vitality - 1);
    if (nextState === 1) events.excited++;
    newNodes.set(id, { state: nextState, cooldown: nextCooldown, vitality, sign: nd.sign });
  }

  // Poids hebbiens (sur la co-excitation du snapshot).
  const newWeights = new Map(graph.weights);
  if (params.hebbian) {
    for (const [key, w] of newWeights) {
      const sep = key.indexOf("|");
      const a = Number(key.slice(0, sep));
      const b = Number(key.slice(sep + 1));
      const coActive =
        graph.nodes.get(a)!.state === 1 && graph.nodes.get(b)!.state === 1;
      newWeights.set(
        key,
        coActive ? Math.min(W_MAX, w + W_UP) : Math.max(0, w - W_DOWN),
      );
    }
  }

  let g: SimGraph = {
    nodes: newNodes,
    adjacency: graph.adjacency,
    weights: newWeights,
    nextId: graph.nextId,
  };
  if (!develop) return { graph: g, events };

  // ───────── DÉVELOPPEMENT ─────────
  const nodes = g.nodes; // déjà neuf : mutation sûre
  const weights = g.weights; // déjà neuf : mutation sûre
  const adj = cloneAdjacency(g.adjacency);
  let nextId = g.nextId;

  // Morts : silencieux (vitalité 0) et faiblement connectés.
  const dead: number[] = [];
  for (const [id, nd] of nodes) {
    if (nd.vitality <= 0 && adj.get(id)!.size < params.surviveThreshold) dead.push(id);
  }
  for (const id of dead) {
    for (const nb of adj.get(id)!) {
      adj.get(nb)!.delete(id);
      weights.delete(edgeKey(id, nb));
    }
    adj.delete(id);
    nodes.delete(id);
  }
  events.died = dead;

  // Naissances : hubs très actifs et pas encore saturés (instantané figé).
  const parents: number[] = [];
  for (const [id, nd] of nodes) {
    const deg = adj.get(id)!.size;
    if (nd.vitality >= VIT_BIRTH && deg >= params.birthThreshold && deg < params.maxDegree) {
      parents.push(id);
    }
  }
  const headroom = params.populationCap - nodes.size;
  let birthing: number[] = [];
  if (headroom > 0) {
    if (parents.length > headroom) {
      shuffleInPlace(parents, rng);
      birthing = parents.slice(0, headroom);
    } else {
      birthing = parents;
    }
  }
  const parentNeighbors = new Map(birthing.map((p) => [p, Array.from(adj.get(p)!)]));
  for (const p of birthing) {
    const childId = nextId++;
    // L'enfant hérite du signe du parent (clone respectant Dale).
    nodes.set(childId, { state: 1, cooldown: 0, vitality: VIT_GAIN, sign: nodes.get(p)!.sign });
    const childSet = new Set<number>();
    adj.set(childId, childSet);
    // Lien parent ↔ enfant.
    childSet.add(p);
    adj.get(p)!.add(childId);
    weights.set(edgeKey(childId, p), W_INIT);
    // Voisins du parent ayant encore de la place, jusqu'au degré maximum.
    for (const nb of parentNeighbors.get(p)!) {
      if (childSet.size >= params.maxDegree) break;
      if (!adj.has(nb)) continue;
      if (adj.get(nb)!.size >= params.maxDegree) continue;
      childSet.add(nb);
      adj.get(nb)!.add(childId);
      weights.set(edgeKey(childId, nb), W_INIT);
    }
    events.born.push({ id: childId, parentId: p });
  }

  // Synaptogenèse : hubs actifs tissent vers un voisin-de-voisin.
  if (params.hebbian) {
    const newEdges: Array<[number, number]> = [];
    for (const [id, nd] of nodes) {
      if (nd.vitality < VIT_SYNAPTO) continue;
      if (adj.get(id)!.size >= params.maxDegree) continue;
      if (rng() >= params.synaptogenesis) continue;
      const target = pickTwoHop(adj, id, rng);
      if (target === null) continue;
      if (adj.get(target)!.size >= params.maxDegree) continue;
      adj.get(id)!.add(target);
      adj.get(target)!.add(id);
      weights.set(edgeKey(id, target), W_INIT);
      newEdges.push([id, target]);
    }
    events.newEdges = newEdges;
  }

  // Élagage : synapses décroissantes (poids quasi nul).
  const dropped: Array<[number, number]> = [];
  for (const [key, w] of weights) {
    if (w >= W_PRUNE) continue;
    const sep = key.indexOf("|");
    const a = Number(key.slice(0, sep));
    const b = Number(key.slice(sep + 1));
    if (adj.get(a)?.has(b)) {
      adj.get(a)!.delete(b);
      adj.get(b)!.delete(a);
      dropped.push([a, b]);
    }
    weights.delete(key);
  }
  events.droppedEdges = dropped;

  g = { nodes, adjacency: adj, weights, nextId };
  return { graph: g, events };
}

/** Statistiques live. */
export function computeStats(graph: SimGraph, generation: number): Stats {
  let excited = 0;
  let refractory = 0;
  let rest = 0;
  let degSum = 0;
  for (const nd of graph.nodes.values()) {
    if (nd.state === 1) excited++;
    else if (nd.cooldown > 0) refractory++;
    else rest++;
  }
  for (const set of graph.adjacency.values()) degSum += set.size;
  const total = graph.nodes.size;
  return {
    generation,
    total,
    excited,
    refractory,
    rest,
    links: degSum / 2,
    avgDegree: total > 0 ? degSum / total : 0,
  };
}

/** Liste des arêtes uniques avec leur poids : [a, b, weight]. */
export function edgeList(graph: SimGraph): Array<[number, number, number]> {
  const edges: Array<[number, number, number]> = [];
  for (const [id, set] of graph.adjacency) {
    for (const nb of set) {
      if (id < nb) edges.push([id, nb, graph.weights.get(edgeKey(id, nb)) ?? W_INIT]);
    }
  }
  return edges;
}
