// Moteur de simulation « Échelle » — typed-arrays (SoA + CSR), pour gros réseaux
// (10K → 1M). Mêmes règles que simulation.ts (importées de rules.ts), mais
// représentation orientée performance : pas de clonage par tick, état en place
// double-bufferisé, adjacence CSR reconstruite seulement aux ticks de
// développement (horloge lente). Embedding spatial 3D au lieu d'un solveur force.

import type { RNG } from "./rng";
import { randInt } from "./rng";
import type { SimParams, Stats } from "./types";
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
  STDP_LTP,
  STDP_LTD,
  firesByThreshold,
  isInhibitory,
} from "./rules";

/** Graphe « Échelle ». Slots stables 0..capacity-1 ; `alive` marque les vivants. */
export interface ScaleGraph {
  capacity: number;
  count: number;
  alive: Uint8Array;
  state: Uint8Array;
  stateNext: Uint8Array;
  cooldown: Uint8Array;
  vitality: Int16Array;
  /** Signe du neurone (loi de Dale) : +1 excitateur, -1 inhibiteur. */
  sign: Int8Array;
  posX: Float32Array;
  posY: Float32Array;
  posZ: Float32Array;
  // CSR (reconstruit aux ticks de développement).
  offsets: Int32Array; // [capacity+1]
  neighbors: Int32Array; // [2E] demi-arête → slot voisin
  edgeIdOf: Int32Array; // [2E] demi-arête → id d'arête non orientée
  // Arêtes : edgeA/edgeB = extrémités. Poids DIRECTIONNELS : edgeW = sens A→B,
  // edgeWb = sens B→A. Par défaut edgeWb miroir d'edgeW (symétrique = historique) ;
  // la STDP (opt-in) les fait diverger.
  edgeA: Int32Array;
  edgeB: Int32Array;
  edgeW: Float32Array;
  edgeWb: Float32Array;
  edgeCount: number;
  // Allocation de slots.
  freeList: number[];
  nextFresh: number;
}

export interface ScaleEvents {
  born: number[];
  died: number[];
  droppedEdges: number;
  newEdges: number;
  excited: number;
}

// 4e élément OPTIONNEL = poids arrière (sens B→A). Absent ⇒ symétrique (edgeWb=edgeW),
// comportement historique. Présent ⇒ asymétrie STDP transportée à travers les reconstructions.
type EdgeList = Array<[number, number, number] | [number, number, number, number]>;

/** Construit le CSR + les tableaux d'arêtes à partir d'une liste d'arêtes. */
function buildTopology(g: ScaleGraph, edges: EdgeList): void {
  const cap = g.capacity;
  const E = edges.length;
  const edgeA = new Int32Array(E);
  const edgeB = new Int32Array(E);
  const edgeW = new Float32Array(E);
  const edgeWb = new Float32Array(E);
  const offsets = new Int32Array(cap + 1);
  for (let e = 0; e < E; e++) {
    const [a, b, w, wb] = edges[e];
    edgeA[e] = a;
    edgeB[e] = b;
    edgeW[e] = w;
    edgeWb[e] = wb ?? w; // poids arrière fourni (STDP) ou miroir du poids avant (symétrique)
    offsets[a + 1]++;
    offsets[b + 1]++;
  }
  for (let i = 0; i < cap; i++) offsets[i + 1] += offsets[i];
  const neighbors = new Int32Array(2 * E);
  const edgeIdOf = new Int32Array(2 * E);
  const cursor = offsets.slice(0, cap);
  for (let e = 0; e < E; e++) {
    const a = edgeA[e];
    const b = edgeB[e];
    const ka = cursor[a]++;
    neighbors[ka] = b;
    edgeIdOf[ka] = e;
    const kb = cursor[b]++;
    neighbors[kb] = a;
    edgeIdOf[kb] = e;
  }
  g.offsets = offsets;
  g.neighbors = neighbors;
  g.edgeIdOf = edgeIdOf;
  g.edgeA = edgeA;
  g.edgeB = edgeB;
  g.edgeW = edgeW;
  g.edgeWb = edgeWb;
  g.edgeCount = E;
}

function emptyGraph(capacity: number): ScaleGraph {
  return {
    capacity,
    count: 0,
    alive: new Uint8Array(capacity),
    state: new Uint8Array(capacity),
    stateNext: new Uint8Array(capacity),
    cooldown: new Uint8Array(capacity),
    vitality: new Int16Array(capacity),
    sign: new Int8Array(capacity).fill(1), // +1 excitateur par défaut (Dale)
    posX: new Float32Array(capacity),
    posY: new Float32Array(capacity),
    posZ: new Float32Array(capacity),
    offsets: new Int32Array(capacity + 1),
    neighbors: new Int32Array(0),
    edgeIdOf: new Int32Array(0),
    edgeA: new Int32Array(0),
    edgeB: new Int32Array(0),
    edgeW: new Float32Array(0),
    edgeWb: new Float32Array(0),
    edgeCount: 0,
    freeList: [],
    nextFresh: 0,
  };
}

export function degreeOf(g: ScaleGraph, i: number): number {
  return g.offsets[i + 1] - g.offsets[i];
}

export function neighborSlots(g: ScaleGraph, i: number): number[] {
  const out: number[] = [];
  for (let k = g.offsets[i]; k < g.offsets[i + 1]; k++) out.push(g.neighbors[k]);
  return out;
}

export function weightBetween(g: ScaleGraph, a: number, b: number): number | undefined {
  for (let k = g.offsets[a]; k < g.offsets[a + 1]; k++) {
    if (g.neighbors[k] === b) return g.edgeW[g.edgeIdOf[k]];
  }
  return undefined;
}

/** Construit un graphe depuis des specs de nœuds + une liste d'arêtes (tests / outils). */
export function scaleGraphFromEdges(
  specs: Array<{ state?: 0 | 1; cooldown?: number; vitality?: number }>,
  edges: Array<[number, number] | [number, number, number]>,
  capacity?: number,
): ScaleGraph {
  const n = specs.length;
  const cap = Math.max(n, capacity ?? n);
  const g = emptyGraph(cap);
  for (let i = 0; i < n; i++) {
    g.alive[i] = 1;
    g.state[i] = specs[i].state ?? 0;
    g.cooldown[i] = specs[i].cooldown ?? 0;
    g.vitality[i] = specs[i].vitality ?? 0;
  }
  g.count = n;
  g.nextFresh = n;
  const list: EdgeList = edges.map((e) => [e[0], e[1], e[2] ?? W_INIT]);
  buildTopology(g, list);
  return g;
}

/** Crée un réseau initial avec embedding spatial 3D (connexions biaisées vers les voisins proches). */
export function createScaleGraph(params: SimParams, rng: RNG): ScaleGraph {
  const n = Math.max(0, Math.floor(params.initialCount));
  const cap = Math.max(n, Math.floor(params.populationCap));
  const g = emptyGraph(cap);

  const radius = Math.max(8, Math.cbrt(Math.max(1, n)) * 7);
  for (let i = 0; i < n; i++) {
    // Point uniforme dans une boule (direction aléatoire, rayon ∝ cbrt(u)).
    let x = 0,
      y = 0,
      z = 0,
      d2 = 0;
    do {
      x = rng() * 2 - 1;
      y = rng() * 2 - 1;
      z = rng() * 2 - 1;
      d2 = x * x + y * y + z * z;
    } while (d2 > 1 || d2 === 0);
    g.posX[i] = x * radius;
    g.posY[i] = y * radius;
    g.posZ[i] = z * radius;
    g.alive[i] = 1;
    g.state[i] = rng() < params.activeRatio ? 1 : 0;
    g.vitality[i] = g.state[i] === 1 ? VIT_GAIN : 0;
    g.sign[i] = isInhibitory(i, params.inhibRatio) ? -1 : 1; // loi de Dale (stride déterministe)
  }
  g.count = n;
  g.nextFresh = n;

  // Grille spatiale → connexions vers les voisins proches (O(N)).
  const cell = Math.max(1, radius / Math.max(1, Math.cbrt(n)));
  const key = (i: number) =>
    `${Math.floor(g.posX[i] / cell)},${Math.floor(g.posY[i] / cell)},${Math.floor(g.posZ[i] / cell)}`;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = key(i);
    const arr = grid.get(k);
    if (arr) arr.push(i);
    else grid.set(k, [i]);
  }
  const maxLinks = Math.min(params.maxInitialLinks, Math.max(0, n - 1));
  const minLinks = Math.max(0, Math.min(params.minInitialLinks, maxLinks));
  const adj: Array<Set<number>> = Array.from({ length: n }, () => new Set<number>());
  const edges: EdgeList = [];
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(g.posX[i] / cell);
    const cy = Math.floor(g.posY[i] / cell);
    const cz = Math.floor(g.posZ[i] / cell);
    const cand: number[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const arr = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (arr) for (const j of arr) if (j !== i) cand.push(j);
        }
    // Tri par distance (déterministe) puis prise des k plus proches.
    cand.sort((p, q) => {
      const dp =
        (g.posX[p] - g.posX[i]) ** 2 + (g.posY[p] - g.posY[i]) ** 2 + (g.posZ[p] - g.posZ[i]) ** 2;
      const dq =
        (g.posX[q] - g.posX[i]) ** 2 + (g.posY[q] - g.posY[i]) ** 2 + (g.posZ[q] - g.posZ[i]) ** 2;
      return dp - dq || p - q;
    });
    const k = maxLinks <= 0 ? 0 : randInt(rng, minLinks, maxLinks);
    for (let t = 0; t < cand.length && adj[i].size < k; t++) {
      const j = cand[t];
      if (adj[i].has(j)) continue;
      adj[i].add(j);
      adj[j].add(i);
      if (i < j) edges.push([i, j, W_INIT]);
      else edges.push([j, i, W_INIT]);
    }
  }
  buildTopology(g, edges);
  return g;
}

function pickTwoHop(g: ScaleGraph, i: number, deadMask: Uint8Array, rng: RNG): number {
  const o0 = g.offsets[i];
  const o1 = g.offsets[i + 1];
  const deg = o1 - o0;
  if (deg === 0) return -1;
  const n1 = g.neighbors[o0 + Math.floor(rng() * deg)];
  const m0 = g.offsets[n1];
  const m1 = g.offsets[n1 + 1];
  const md = m1 - m0;
  if (md === 0) return -1;
  // Essaie quelques candidats au hasard parmi les voisins de n1.
  for (let attempt = 0; attempt < 4; attempt++) {
    const t = g.neighbors[m0 + Math.floor(rng() * md)];
    if (t === i || deadMask[t]) continue;
    // déjà connecté ?
    let connected = false;
    for (let k = o0; k < o1; k++)
      if (g.neighbors[k] === t) {
        connected = true;
        break;
      }
    if (!connected) return t;
  }
  return -1;
}

/** Avance d'un tick. `develop` active mort/naissance/câblage. Mute `g` en place.
 *  `clampNext` (clamp de SORTIE) force ces slots à décharger CE tick APRÈS l'activité mais
 *  AVANT la plasticité : fournit la paire pré(state,t-1)→post(stateNext,t) qu'exige la STDP
 *  pour entraîner une séquence (sinon applyInput force l'état COURANT → réfractaire le même
 *  tick, incompatible avec pré→post). Défaut vide ⇒ comportement historique inchangé. */
export function stepScale(
  g: ScaleGraph,
  params: SimParams,
  rng: RNG,
  develop = false,
  clampNext?: Iterable<number>,
): { graph: ScaleGraph; events: ScaleEvents } {
  const { state, stateNext, cooldown, vitality, alive, offsets, neighbors, edgeW, edgeWb, edgeA, edgeIdOf, sign } = g;
  const surviveT = params.surviveThreshold;
  const birthT = params.birthThreshold;
  const phi = params.fireFraction;
  const R = params.refractory;
  const spont = params.spontaneous;
  let excited = 0;

  // ───────── ACTIVITÉ ─────────
  for (let i = 0; i < g.capacity; i++) {
    if (!alive[i]) {
      stateNext[i] = 0;
      continue;
    }
    let ns: number;
    if (cooldown[i] > 0) {
      ns = 0;
      cooldown[i] = cooldown[i] - 1;
    } else if (state[i] === 1) {
      ns = 0;
      cooldown[i] = R;
    } else {
      // Drive NET signé / poids total (loi de Dale, cf. firesByThreshold) : un voisin
      // excité excitateur (+1) rapproche du seuil, un inhibiteur (-1) l'en éloigne.
      // Numérateur = Σ signe·w des voisins excités (peut être <0) ; dénominateur = Σ|w|.
      let netW = 0;
      let totW = 0;
      const o1 = offsets[i + 1];
      for (let k = offsets[i]; k < o1; k++) {
        const e = edgeIdOf[k];
        const nb = neighbors[k];
        // poids DIRECTIONNEL nb→i : edgeW si nb est l'extrémité A (sens A→B), sinon edgeWb.
        const w = edgeA[e] === nb ? edgeW[e] : edgeWb[e];
        totW += w;
        if (state[nb] === 1) netW += sign[nb] * w;
      }
      const fires = firesByThreshold(netW, totW, phi) || (spont > 0 && rng() < spont);
      ns = fires ? 1 : 0;
    }
    stateNext[i] = ns;
    vitality[i] = ns === 1 ? Math.min(VIT_MAX, vitality[i] + VIT_GAIN) : Math.max(0, vitality[i] - 1);
    if (ns === 1) excited++;
  }

  // Clamp de SORTIE (cf. doc) : force stateNext de certains slots AVANT la plasticité, pour
  // que la STDP voie pré(state,t-1)→post(stateNext,t) même quand le drive est sous-seuil.
  if (clampNext) {
    for (const s of clampNext) {
      if (!alive[s]) continue;
      if (stateNext[s] !== 1) {
        stateNext[s] = 1;
        excited++;
        vitality[s] = Math.min(VIT_MAX, vitality[s] + VIT_GAIN);
      }
    }
  }

  // Plasticité (sur l'état du snapshot, avant échange : state = pré t-1, stateNext = post t).
  if (params.hebbian) {
    const { edgeA, edgeB, edgeW, edgeWb } = g;
    if ((params.plasticity ?? "hebb") === "stdp") {
      // STDP DIRECTIONNEL : a→b renforcé si a(t-1) précède b(t) ; affaibli si l'inverse.
      for (let e = 0; e < g.edgeCount; e++) {
        const a = edgeA[e], b = edgeB[e];
        const abCausal = state[a] === 1 && stateNext[b] === 1; // a→b
        const baCausal = state[b] === 1 && stateNext[a] === 1; // b→a
        edgeW[e] = Math.min(W_MAX, Math.max(0, edgeW[e] + (abCausal ? STDP_LTP : 0) - (baCausal ? STDP_LTD : 0)));
        edgeWb[e] = Math.min(W_MAX, Math.max(0, edgeWb[e] + (baCausal ? STDP_LTP : 0) - (abCausal ? STDP_LTD : 0)));
      }
    } else {
      // Hebb SAME-TICK symétrique (défaut) : maintient edgeWb = edgeW.
      for (let e = 0; e < g.edgeCount; e++) {
        const co = state[edgeA[e]] === 1 && state[edgeB[e]] === 1;
        edgeW[e] = co ? Math.min(W_MAX, edgeW[e] + W_UP) : Math.max(0, edgeW[e] - W_DOWN);
        edgeWb[e] = edgeW[e];
      }
    }
  }

  // Échange des buffers d'état.
  g.state = stateNext;
  g.stateNext = state;

  const events: ScaleEvents = { born: [], died: [], droppedEdges: 0, newEdges: 0, excited };
  if (!develop) return { graph: g, events };

  // ───────── DÉVELOPPEMENT (horloge lente) ─────────
  const st = g.state; // post-activité
  const deadMask = new Uint8Array(g.capacity);
  const dead: number[] = [];
  for (let i = 0; i < g.capacity; i++) {
    if (alive[i] && vitality[i] <= 0 && degreeOf(g, i) < surviveT) {
      deadMask[i] = 1;
      dead.push(i);
    }
  }

  // Parents éligibles.
  const parents: number[] = [];
  for (let i = 0; i < g.capacity; i++) {
    if (!alive[i] || deadMask[i]) continue;
    const deg = degreeOf(g, i);
    if (vitality[i] >= VIT_BIRTH && deg >= birthT && deg < params.maxDegree) parents.push(i);
  }
  const aliveAfterDeaths = g.count - dead.length;
  const roomCap = params.populationCap - aliveAfterDeaths;
  const roomSlots = g.capacity - aliveAfterDeaths;
  const room = Math.max(0, Math.min(roomCap, roomSlots));
  let birthing: number[];
  if (room <= 0) birthing = [];
  else if (parents.length > room) {
    for (let i = 0; i < room; i++) {
      const j = i + Math.floor(rng() * (parents.length - i));
      const tmp = parents[i];
      parents[i] = parents[j];
      parents[j] = tmp;
    }
    birthing = parents.slice(0, room);
  } else birthing = parents;

  // Nouvelle liste d'arêtes : survivantes (deux bouts vivants, poids ≥ seuil).
  const newEdges: EdgeList = [];
  let dropped = 0;
  for (let e = 0; e < g.edgeCount; e++) {
    const a = g.edgeA[e];
    const b = g.edgeB[e];
    if (deadMask[a] || deadMask[b]) continue; // retirée par mort (non comptée)
    // Élague sur le poids MAX des deux sens : en STDP une synapse peut être forte en
    // arrière (edgeWb) alors que l'avant (edgeW) a décru — la garder préserve l'acquis.
    if (Math.max(g.edgeW[e], g.edgeWb[e]) < W_PRUNE) {
      dropped++;
      continue;
    }
    // Transporte les DEUX poids directionnels (sinon un tick de dev réinitialiserait
    // edgeWb=edgeW et effacerait ce que la STDP a appris).
    newEdges.push([a, b, g.edgeW[e], g.edgeWb[e]]);
  }

  // Libère les slots morts (réutilisables par les naissances).
  for (const d of dead) {
    alive[d] = 0;
    st[d] = 0;
    cooldown[d] = 0;
    vitality[d] = 0;
    g.freeList.push(d);
  }

  const alloc = (): number => {
    if (g.freeList.length > 0) return g.freeList.pop()!;
    if (g.nextFresh < g.capacity) return g.nextFresh++;
    return -1;
  };

  // Naissances : enfant relié au parent + voisins-snapshot survivants (≤ maxDegree).
  const born: number[] = [];
  for (const p of birthing) {
    const child = alloc();
    if (child < 0) break;
    alive[child] = 1;
    st[child] = 1;
    cooldown[child] = 0;
    vitality[child] = VIT_GAIN;
    sign[child] = sign[p]; // l'enfant hérite du signe du parent (clone respectant Dale)
    const ang = rng() * Math.PI * 2;
    const r = 4 + rng() * 6;
    g.posX[child] = g.posX[p] + Math.cos(ang) * r;
    g.posY[child] = g.posY[p] + Math.sin(ang) * r;
    g.posZ[child] = g.posZ[p] + (rng() * 2 - 1) * r;
    let childDeg = 0;
    newEdges.push([Math.min(child, p), Math.max(child, p), W_INIT]);
    childDeg++;
    for (let k = g.offsets[p]; k < g.offsets[p + 1]; k++) {
      if (childDeg >= params.maxDegree) break;
      const nb = g.neighbors[k];
      if (deadMask[nb]) continue;
      newEdges.push([Math.min(child, nb), Math.max(child, nb), W_INIT]);
      childDeg++;
    }
    born.push(child);
  }

  // Synaptogenèse : hubs actifs tissent vers un voisin-de-voisin spatial.
  let created = 0;
  if (params.hebbian) {
    for (let i = 0; i < g.capacity; i++) {
      if (!alive[i] || deadMask[i]) continue;
      if (vitality[i] < VIT_SYNAPTO) continue;
      if (degreeOf(g, i) >= params.maxDegree) continue;
      if (rng() >= params.synaptogenesis) continue;
      const target = pickTwoHop(g, i, deadMask, rng);
      if (target < 0 || degreeOf(g, target) >= params.maxDegree) continue;
      newEdges.push([Math.min(i, target), Math.max(i, target), W_INIT]);
      created++;
    }
  }

  g.count = aliveAfterDeaths + born.length;
  buildTopology(g, newEdges);

  events.born = born;
  events.died = dead;
  events.droppedEdges = dropped;
  events.newEdges = created;
  return { graph: g, events };
}

/** Statistiques live. */
export function scaleStats(g: ScaleGraph, generation: number): Stats {
  let excited = 0;
  let refractory = 0;
  let rest = 0;
  for (let i = 0; i < g.capacity; i++) {
    if (!g.alive[i]) continue;
    if (g.state[i] === 1) excited++;
    else if (g.cooldown[i] > 0) refractory++;
    else rest++;
  }
  const total = g.count;
  return {
    generation,
    total,
    excited,
    refractory,
    rest,
    links: g.edgeCount,
    avgDegree: total > 0 ? (2 * g.edgeCount) / total : 0,
  };
}
