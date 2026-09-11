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
import { LIF_DEFAUT, ORGANISME_DEFAUT, PLASTICITE_DEFAUT, VOIE_DEFAUT } from "../sim/params";
import { injecterOdeur, stepVoie } from "../sim/voie";
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
  /** Taille du module olfactif (0 si inactif) — l'activité s'étend de n à n+nVoie. */
  nVoie: number;
  /** Répondeurs par code, mesurés au build par sondage — groupent les poids appris. */
  repFood: Set<number>;
  repToxin: Set<number>;
  /** Décharges/tick des sorties du module, lissées par batch. */
  mbonRate: number;
  serRate: number;
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

/** Sondage : les KC qui répondent à chaque code — servent à grouper les poids
 *  appris dans l'instantané (mesuré une fois au build, avant tout apprentissage). */
function sondageCodes(org: Organism, rng: () => number): { repFood: Set<number>; repToxin: Set<number> } {
  const v = org.voie!;
  const kc0 = v.bornes.kc.start;
  const kc1 = kc0 + v.bornes.kc.count;
  const sonder = (odeur: NonNullable<Organism["odeurFood"]>): Set<number> => {
    for (let t = 0; t < 500; t++) stepVoie(v, rng, 0, 0);
    const comptes = new Map<number, number>();
    for (let t = 0; t < 2000; t++) {
      injecterOdeur(v, odeur.intensites, 1.5);
      stepVoie(v, rng, 0, 0);
      const sp = v.lif.spikes;
      for (let j = 0; j < v.lif.spikeCount; j++) {
        const i = sp[j];
        if (i >= kc0 && i < kc1) comptes.set(i, (comptes.get(i) ?? 0) + 1);
      }
    }
    const rep = new Set<number>();
    for (const [i, c] of comptes) if (c >= 30) rep.add(i);
    return rep;
  };
  return { repFood: sonder(org.odeurFood!), repToxin: sonder(org.odeurToxin!) };
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
      // Rang 5 : la voie olfactive est greffée — le même régime que la porte.
      voie: {
        actif: true,
        voie: { ...VOIE_DEFAUT, seed: seed ^ 0x5eed },
        lif: LIF_DEFAUT,
        plast: {
          ...PLASTICITE_DEFAUT,
          lr: 0.05,
          tauElig: 500,
          eligTrace: true,
          seuilElig: 0.2,
          fraisMin: 0.3,
        },
        gainApproche: 0.2,
        gainDir: 0.3,
        gainEvite: 0.35,
        oaDose: 4,
        daDose: 4,
        extDose: 4,
        injectOdeur: 1.5,
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
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const { repFood, repToxin } = sondageCodes(org, rng);
  const nVoie = org.voie ? org.voie.topo.n : 0;
  return {
    org,
    rng,
    activity: new Float32Array(n + nVoie),
    nVoie,
    repFood,
    repToxin,
    mbonRate: 0,
    serRate: 0,
  };
}

function envoyerPret(s: Session): void {
  const { topo } = s.org.brain;
  const n = topo.n;
  const nv = s.nVoie;
  const positions = new Float32Array(3 * (n + nv));
  let rayon = 1;
  for (let i = 0; i < n; i++) {
    positions[3 * i] = topo.posX[i];
    positions[3 * i + 1] = topo.posY[i];
    positions[3 * i + 2] = topo.posZ[i];
    if (Math.abs(topo.posX[i]) > rayon) rayon = Math.abs(topo.posX[i]);
  }
  // Le module olfactif en surimpression : sa calotte, décalée à droite du
  // cerveau — visible comme un organe annexe qui s'anime sous les odeurs.
  if (s.org.voie) {
    const vt = s.org.voie.topo;
    for (let i = 0; i < nv; i++) {
      positions[3 * (n + i)] = vt.posX[i] + rayon * 1.6;
      positions[3 * (n + i) + 1] = vt.posY[i];
      positions[3 * (n + i) + 2] = vt.posZ[i];
    }
  }
  const regions = topo.regions.map((r) => ({
    id: r.id,
    start: r.start,
    count: r.count,
    pools: r.pools,
    poolSize: r.poolSize,
  }));
  if (s.org.voie) {
    for (const r of s.org.voie.topo.regions) {
      regions.push({ id: r.id, start: n + r.start, count: r.count, pools: r.pools, poolSize: r.poolSize });
    }
  }
  post(
    {
      type: "ready",
      n: n + nv,
      e: topo.e,
      positions,
      regions,
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
  const nB = org.brain.topo.n;
  let mb = 0;
  let sv = 0;
  const m0 = org.voie ? org.voie.bornes.mbon.start : 0;
  const m1 = org.voie ? m0 + org.voie.bornes.mbon.count : 0;
  const s0 = org.voie ? org.voie.bornes.ser.start : 0;
  const s1 = org.voie ? s0 + org.voie.bornes.ser.count : 0;
  for (let k = 0; k < steps; k++) {
    stepOrganism(org, rng);
    for (let i = 0; i < activity.length; i++) activity[i] *= DECAY;
    const spikes = org.brain.lif.spikes;
    for (let j = 0; j < org.brain.lif.spikeCount; j++) activity[spikes[j]] = 1;
    if (org.voie) {
      const vs = org.voie.lif.spikes;
      for (let j = 0; j < org.voie.lif.spikeCount; j++) {
        const i = vs[j];
        activity[nB + i] = 1;
        if (i >= m0 && i < m1) mb++;
        else if (i >= s0 && i < s1) sv++;
      }
    }
  }
  if (org.voie) {
    s.mbonRate = s.mbonRate * 0.8 + (mb / steps) * 0.2;
    s.serRate = s.serRate * 0.8 + (sv / steps) * 0.2;
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
  post(
    {
      type: "frame",
      activity: vue,
      snap: snapshotOrganism(org, lastDa, measuredTps, {
        repFood: s.repFood,
        repToxin: s.repToxin,
        mbon: s.mbonRate,
        ser: s.serRate,
      }),
    },
    [vue.buffer],
  );
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
