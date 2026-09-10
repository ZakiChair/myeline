// Worker du lot 2 : l'organisme (src/sim) y vit à son propre rythme et le thread
// principal ne reçoit que des images. Zéro recopie utile : l'activité part par
// transfert de buffers en ping-pong (le main rend chaque buffer consommé).
//
//   init   → construit l'organisme, renvoie positions + régions (une fois)
//   run    → lance/suspend la boucle de ticks
//   frame  → { activity: Float32Array transférée, snap } ~30 fois/s
//   edges  → sous-échantillon d'arêtes pour la surcouche de rendu (à la demande)
//   reset  → reconstruit tout (graine, graine de monde, taille)
//
// Pas de SharedArrayBuffer (imposerait des en-têtes COOP/COEP) : les transférables
// suffisent — 200 Ko × 30 fps de niveau lumineux.

import { mulberry32 } from "../lib/rng";
import { createOrganism, stepOrganism, type Organism } from "../sim/organism";
import { ORGANISME_DEFAUT } from "../sim/params";
import { snapshotOrganism } from "../sim/snapshot";
import type { WorkerIn, WorkerOut } from "./protocol";

/** Cadence d'émission des images vers le main. */
const FRAME_MS = 33;
/** Décroissance par tick du niveau lumineux (τ ≈ 12 ticks). */
const DECAY = 0.92;
/** Sous-échantillon d'arêtes visé pour la surcouche de rendu. */
const EDGES_MAX = 80_000;
/** Garde-fou anti-rattrapage : au plus ce nombre de ticks rattrapés par batch. */
const MAX_BATCH = 2000;

interface Session {
  org: Organism;
  rng: () => number;
  activity: Float32Array;
}

let session: Session | null = null;
let running = false;
let hz = 150;
let timer: ReturnType<typeof setInterval> | null = null;
let lastTickWall = 0;
let measuredTps = 0;
/** Dernière dopamine émise, capturée dans la couture dopamineSource. */
let lastDa = 0;

/** Buffers libres rendus par le main. S'il n'y en a plus, on alloue (auto-cicatrisant). */
const freeBuffers: ArrayBuffer[] = [];

function post(msg: WorkerOut, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, { transfer });
}

function build(n: number, seed: number, worldSeed: number): Session {
  const org = createOrganism(
    {
      ...ORGANISME_DEFAUT,
      worldSeed,
      brain: {
        ...ORGANISME_DEFAUT.brain,
        topology: { ...ORGANISME_DEFAUT.brain.topology, n, seed },
      },
    },
    {
      // La valeur par défaut, réécrite pour être observée : capture du dernier
      // signal de dopamine pour l'instantané (dopamineSource, la couture prévue).
      dopamineSource: (ctx) => {
        const da = ctx.reward - ctx.rBar;
        lastDa = da;
        return da;
      },
    },
  );
  return { org, rng: mulberry32(seed ^ 0x9e3779b9), activity: new Float32Array(n) };
}

function envoyerPret(s: Session): void {
  const { topo } = s.org.brain;
  const n = topo.n;
  const positions = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    positions[3 * i] = topo.posX[i];
    positions[3 * i + 1] = topo.posY[i];
    positions[3 * i + 2] = topo.posZ[i];
  }
  post(
    {
      type: "ready",
      n,
      e: topo.e,
      positions,
      regions: topo.regions.map((r) => ({
        id: r.id,
        start: r.start,
        count: r.count,
        pools: r.pools,
        poolSize: r.poolSize,
      })),
      running,
    },
    [positions.buffer],
  );
}

function batch(): void {
  const s = session;
  if (!s || !running) return;
  const now = performance.now();
  const dt = now - lastTickWall;
  lastTickWall = now;
  // Ticks dus depuis la dernière émission, bornés pour ne jamais creuser un retard.
  const steps = Math.max(1, Math.min(MAX_BATCH, Math.round((dt * hz) / 1000)));

  const { org, rng, activity } = s;
  for (let k = 0; k < steps; k++) {
    stepOrganism(org, rng);
    for (let i = 0; i < activity.length; i++) activity[i] *= DECAY;
    const spikes = org.brain.lif.spikes;
    for (let j = 0; j < org.brain.lif.spikeCount; j++) activity[spikes[j]] = 1;
  }

  // La cadence affichée est celle LIVRÉE (ticks / temps réel écoulé), pas la
  // vitesse de calcul du batch — si le moteur ne suit pas, elle le montre.
  const reel = (steps * 1000) / dt;
  measuredTps = measuredTps === 0 ? reel : measuredTps * 0.85 + reel * 0.15;

  // Ping-pong : on réutilise un buffer rendu par le main (taille vérifiée — après
  // un reset à taille différente, les anciens sont jetés) ou on en alloue un.
  let buf = freeBuffers.pop();
  while (buf !== undefined && buf.byteLength !== activity.byteLength) {
    buf = freeBuffers.pop();
  }
  const vue = new Float32Array(buf ?? new ArrayBuffer(activity.byteLength));
  vue.set(activity);
  post({ type: "frame", activity: vue, snap: snapshotOrganism(org, lastDa, measuredTps) }, [
    vue.buffer,
  ]);
}

function setRunning(v: boolean): void {
  running = v;
  if (running && timer === null) {
    lastTickWall = performance.now();
    timer = setInterval(batch, FRAME_MS);
  } else if (!running && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function envoyerAretes(s: Session): void {
  const { topo } = s.org.brain;
  const e = topo.e;
  // Pas de tri sur 3 M d'arêtes : pas constant sur les arêtes excitatrices (les
  // poids initiaux sont uniformes, « les plus fortes » ne veut rien dire avant
  // apprentissage — l'échantillon est un tirage régulier, pas un classement).
  const candidats: number[] = [];
  const w = topo.w;
  for (let k = 0; k < e; k++) if (w[k] > 0) candidats.push(k);
  const pas = Math.max(1, Math.floor(candidats.length / EDGES_MAX));
  const m = Math.min(EDGES_MAX, Math.ceil(candidats.length / pas));
  const pairs = new Uint32Array(m * 2);
  let j = 0;
  for (let i = 0; i < candidats.length && j < m; i += pas, j++) {
    const k = candidats[i];
    // Retrouver la source d'une arête exige une recherche dans outOffsets —
    // dichotomie par somme préfixe (inversé : le main connaît la cible).
    pairs[2 * j] = sourceDe(topo.outOffsets, k);
    pairs[2 * j + 1] = topo.outTarget[k];
  }
  post({ type: "edges", pairs }, [pairs.buffer]);
}

/** Indice de la source de l'arête k : première cellule dont la somme préfixe dépasse k. */
function sourceDe(outOffsets: Int32Array, k: number): number {
  let lo = 0;
  let hi = outOffsets.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (outOffsets[mid] <= k) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  switch (msg.type) {
    case "init": {
      freeBuffers.push(...msg.buffers);
      session = build(msg.n, msg.seed, msg.worldSeed);
      setRunning(true);
      envoyerPret(session);
      break;
    }
    case "reset": {
      freeBuffers.length = 0;
      session = build(msg.n, msg.seed, msg.worldSeed);
      measuredTps = 0;
      envoyerPret(session);
      break;
    }
    case "run":
      setRunning(msg.running);
      break;
    case "speed":
      hz = Math.max(1, msg.hz);
      break;
    case "edges":
      if (session) envoyerAretes(session);
      break;
    case "recycle":
      freeBuffers.push(msg.buffer);
      break;
  }
};

export {};
