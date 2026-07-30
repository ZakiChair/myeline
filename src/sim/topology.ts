// Topologie du cerveau « Vie » : régions, dalle corticale torique, CSR bidirectionnel.
// Pur et déterministe : même graine ⇒ même câblage, bit à bit.
//
// Deux CSR partagent le MÊME tableau de poids `w` :
//   - sortant (outOffsets/outTarget/outDelay) pour propager les décharges ;
//   - entrant (inOffsets/inSource/inEdge) pour la potentialisation côté post-synaptique et
//     la mise à l'échelle homéostatique.
// `inEdge[k]` est l'indice dans `w` de l'arête, c'est-à-dire son indice dans le CSR sortant.

import { mulberry32, randInt, type RNG } from "../lib/rng";
import type { Region, RegionId, TopologyParams } from "./params";

export interface Topology {
  n: number;
  e: number;
  regions: Region[];
  /** [n] → indice de la région dans `regions`. */
  regionOf: Uint8Array;
  /** [n] +1 excitateur, -1 inhibiteur (loi de Dale : fixé à vie). */
  sign: Int8Array;
  posX: Float32Array;
  posY: Float32Array;
  posZ: Float32Array;
  // CSR sortant
  outOffsets: Int32Array; // [n+1]
  outTarget: Int32Array; // [e]
  outDelay: Uint8Array; // [e] dans [1, delayMax]
  // CSR entrant
  inOffsets: Int32Array; // [n+1]
  inSource: Int32Array; // [e]
  inEdge: Int32Array; // [e] → indice dans w
  w: Float32Array; // [e]
}

/** Taille de référence : la conception donne ses tailles de région à N = 50 000. */
const REF_N = 50_000;

/**
 * Structure des régions périphériques. Le NOMBRE de pools est une propriété structurelle
 * (24 secteurs olfactifs, 4 pools moteurs…) : il ne dépend pas de n. Seule la TAILLE de pool
 * suit n, ce qui fait retrouver exactement le tableau de la conception à n = 50 000.
 */
const DISPOSITION: ReadonlyArray<{ id: RegionId; pools: number; poolSizeRef: number }> = [
  { id: "OLF_FOOD", pools: 24, poolSizeRef: 60 },
  { id: "OLF_TOXIN", pools: 24, poolSizeRef: 60 },
  { id: "ALARM", pools: 16, poolSizeRef: 50 },
  { id: "SOMA", pools: 8, poolSizeRef: 40 },
  { id: "INTERO", pools: 12, poolSizeRef: 40 },
  { id: "MOTOR", pools: 4, poolSizeRef: 500 },
  { id: "VTA", pools: 1, poolSizeRef: 20 },
];

/** Régions dont les neurones projettent vers le cortex. */
const CAPTEURS: ReadonlySet<RegionId> = new Set<RegionId>([
  "OLF_FOOD",
  "OLF_TOXIN",
  "ALARM",
  "SOMA",
  "INTERO",
]);

/** Tirage gaussien centré réduit (Box–Muller), déterministe via le RNG fourni. */
function gauss(rng: RNG): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Reste positif : la dalle corticale est torique. */
function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}

export function regionById(topo: Topology, id: RegionId): Region {
  const r = topo.regions.find((x) => x.id === id);
  if (!r) throw new Error(`région inconnue : ${id}`);
  return r;
}

export function poolRange(r: Region, pool: number): { start: number; end: number } {
  if (pool < 0 || pool >= r.pools) throw new Error(`pool ${pool} hors de ${r.id} (${r.pools})`);
  const start = r.start + pool * r.poolSize;
  return { start, end: start + r.poolSize };
}

/** Découpe les n neurones en régions ; le cortex reçoit tout le reste. */
function decouper(n: number): Region[] {
  const periph = DISPOSITION.map((d) => ({
    ...d,
    poolSize: Math.max(2, Math.round((d.poolSizeRef * n) / REF_N)),
  }));
  const totalPeriph = periph.reduce((s, d) => s + d.pools * d.poolSize, 0);
  const nCortex = n - totalPeriph;
  if (nCortex <= totalPeriph) {
    throw new Error(
      `n = ${n} est trop petit : le cortex (${nCortex}) doit rester majoritaire face à la périphérie (${totalPeriph})`,
    );
  }

  const regions: Region[] = [];
  let start = 0;
  const pousser = (id: RegionId, pools: number, poolSize: number, count: number) => {
    regions.push({ id, start, count, pools, poolSize });
    start += count;
  };
  for (const d of periph) {
    // Le cortex s'insère juste avant les régions de sortie, comme dans la conception.
    if (d.id === "MOTOR") pousser("CORTEX", 1, nCortex, nCortex);
    pousser(d.id, d.pools, d.poolSize, d.pools * d.poolSize);
  }
  return regions;
}

/**
 * Ancre d'une région périphérique dans la dalle, par suite de faible discrépance : deux
 * modalités atterrissent dans des territoires corticaux distincts et bien séparés.
 */
function ancreRegion(ri: number, l: number): [number, number, number] {
  const phi = 0.6180339887498949;
  const f = (k: number) => ((ri + 1) * phi * (k + 1)) % 1;
  return [f(0) * l, f(1) * l, f(2) * l];
}

/**
 * Centre du territoire cortical d'un pool : l'ancre de la région, décalée sur un petit cercle
 * selon le numéro de pool. Deux secteurs voisins arrivent donc dans des territoires voisins
 * mais distincts — condition pour qu'un gradient d'odeur soit lisible par le cortex.
 */
function centrePool(ri: number, pool: number, pools: number, l: number): [number, number, number] {
  const [ax, ay, az] = ancreRegion(ri, l);
  const ang = (2 * Math.PI * pool) / pools;
  const r = l / 6;
  return [ax + Math.cos(ang) * r, ay + Math.sin(ang) * r, az];
}

export function buildTopology(p: TopologyParams): Topology {
  if (p.delayMax < 1 || p.delayMax > 255) throw new Error("delayMax doit être dans [1, 255]");
  const rng = mulberry32(p.seed);
  const regions = decouper(p.n);
  const n = p.n;

  const regionOf = new Uint8Array(n);
  for (let ri = 0; ri < regions.length; ri++) {
    const r = regions[ri];
    regionOf.fill(ri, r.start, r.start + r.count);
  }

  const ctx = regions.find((r) => r.id === "CORTEX")!;
  const mot = regions.find((r) => r.id === "MOTOR")!;
  const riMot = regions.indexOf(mot);
  const nCortex = ctx.count;
  // Côté de la dalle cubique. L³ peut dépasser nCortex : les sites en trop sont rejetés au
  // tirage (voir cibleCorticale), ce qui garde le câblage homogène.
  const l = Math.max(3, Math.ceil(Math.cbrt(nCortex)));

  // ── Signes (loi de Dale) : tirage EXACT, pas binomial, pour que la part d'inhibiteurs ne
  // dépende pas de la graine. Capteurs, moteurs et VTA sont excitateurs.
  const sign = new Int8Array(n).fill(1);
  const nInh = Math.round(p.fracInh * nCortex);
  const idx = new Int32Array(nCortex);
  for (let k = 0; k < nCortex; k++) idx[k] = ctx.start + k;
  for (let k = 0; k < nInh; k++) {
    const j = k + Math.floor(rng() * (nCortex - k));
    const tmp = idx[k];
    idx[k] = idx[j];
    idx[j] = tmp;
    sign[idx[k]] = -1;
  }

  // ── Positions. Cortex : coordonnées de dalle centrées. Périphérie : anneau décoratif
  // autour de la dalle, utilisé par le rendu du lot 2, jamais par le câblage.
  const posX = new Float32Array(n);
  const posY = new Float32Array(n);
  const posZ = new Float32Array(n);
  for (let k = 0; k < nCortex; k++) {
    const i = ctx.start + k;
    posX[i] = (k % l) - l / 2;
    posY[i] = (Math.floor(k / l) % l) - l / 2;
    posZ[i] = Math.floor(k / (l * l)) - l / 2;
  }
  for (let ri = 0; ri < regions.length; ri++) {
    const r = regions[ri];
    if (r.id === "CORTEX") continue;
    for (let k = 0; k < r.count; k++) {
      const pool = r.poolSize > 0 ? Math.floor(k / r.poolSize) : 0;
      const ang = (2 * Math.PI * pool) / r.pools + (k % r.poolSize) * 0.01;
      const rayon = l * 0.95;
      posX[r.start + k] = Math.cos(ang) * rayon;
      posY[r.start + k] = Math.sin(ang) * rayon;
      posZ[r.start + k] = (ri - regions.length / 2) * (l / regions.length);
    }
  }

  /** Tire une cible corticale autour de (cx, cy, cz), en mailles, avec enroulement torique. */
  const cibleCorticale = (cx: number, cy: number, cz: number, sigma: number): number => {
    for (let essai = 0; essai < 8; essai++) {
      const x = mod(Math.round(cx + gauss(rng) * sigma), l);
      const y = mod(Math.round(cy + gauss(rng) * sigma), l);
      const z = mod(Math.round(cz + gauss(rng) * sigma), l);
      const k = (z * l + y) * l + x;
      if (k < nCortex) return ctx.start + k;
    }
    // La dalle dépasse nCortex et les tirages sont tous tombés dans le vide : repli uniforme.
    return ctx.start + randInt(rng, 0, nCortex - 1);
  };

  /** Idem, mais interdit la boucle sur soi (seul le câblage cortex → cortex peut la produire). */
  const cibleHorsSoi = (soi: number, cx: number, cy: number, cz: number, sigma: number): number => {
    for (let essai = 0; essai < 8; essai++) {
      const c = cibleCorticale(cx, cy, cz, sigma);
      if (c !== soi) return c;
    }
    let c = ctx.start + randInt(rng, 0, nCortex - 1);
    if (c === soi) c = ctx.start + ((soi - ctx.start + 1) % nCortex);
    return c;
  };

  // ── Passe 1 : les entrées motrices sont tirées par le neurone MOTEUR, mais ce sont des
  // arêtes SORTANTES de neurones corticaux. Il faut donc les connaître avant la somme préfixe.
  const motorSrc = new Int32Array(mot.count * p.kMotorIn);
  for (let j = 0; j < mot.count; j++) {
    const pool = Math.floor(j / mot.poolSize);
    const [cx, cy, cz] = centrePool(riMot, pool, mot.pools, l);
    for (let k = 0; k < p.kMotorIn; k++) {
      motorSrc[j * p.kMotorIn + k] = cibleCorticale(cx, cy, cz, p.sigmaExc);
    }
  }

  // ── Comptage des degrés sortants, puis somme préfixe.
  const outOffsets = new Int32Array(n + 1);
  for (let ri = 0; ri < regions.length; ri++) {
    const r = regions[ri];
    if (r.id === "CORTEX") {
      for (let i = r.start; i < r.start + r.count; i++) outOffsets[i + 1] = p.kCortex;
    } else if (CAPTEURS.has(r.id)) {
      for (let i = r.start; i < r.start + r.count; i++) outOffsets[i + 1] = p.kSensory;
    }
    // MOTOR et VTA sont des feuilles : aucune arête sortante.
  }
  for (let k = 0; k < motorSrc.length; k++) outOffsets[motorSrc[k] + 1]++;
  for (let i = 0; i < n; i++) outOffsets[i + 1] += outOffsets[i];
  const e = outOffsets[n];

  // ── Passe 2 : remplissage. L'ordre des arêtes à l'intérieur du bloc d'une source est libre.
  const outTarget = new Int32Array(e);
  const outDelay = new Uint8Array(e);
  const w = new Float32Array(e);
  const cursor = outOffsets.slice(0, n);
  const ecrire = (src: number, cible: number, poids: number) => {
    const k = cursor[src]++;
    outTarget[k] = cible;
    outDelay[k] = randInt(rng, 1, p.delayMax);
    w[k] = poids;
  };
  /** Poids d'une arête récurrente : le signe de la source, jamais celui de la cible (Dale). */
  const poidsRecurrent = (src: number) => (sign[src] === 1 ? p.wExc : -p.wInh);

  for (let ri = 0; ri < regions.length; ri++) {
    const r = regions[ri];
    if (!CAPTEURS.has(r.id)) continue;
    for (let k = 0; k < r.count; k++) {
      const i = r.start + k;
      const pool = Math.floor(k / r.poolSize);
      const [cx, cy, cz] = centrePool(ri, pool, r.pools, l);
      for (let q = 0; q < p.kSensory; q++) {
        ecrire(i, cibleCorticale(cx, cy, cz, p.sigmaExc), p.wSensory);
      }
    }
  }
  for (let k = 0; k < nCortex; k++) {
    const i = ctx.start + k;
    const cx = k % l;
    const cy = Math.floor(k / l) % l;
    const cz = Math.floor(k / (l * l));
    const sigma = sign[i] === 1 ? p.sigmaExc : p.sigmaInh;
    for (let q = 0; q < p.kCortex; q++) {
      ecrire(i, cibleHorsSoi(i, cx, cy, cz, sigma), poidsRecurrent(i));
    }
  }
  for (let j = 0; j < mot.count; j++) {
    for (let k = 0; k < p.kMotorIn; k++) {
      const src = motorSrc[j * p.kMotorIn + k];
      ecrire(src, mot.start + j, poidsRecurrent(src));
    }
  }

  // ── CSR entrant, par comptage.
  const inOffsets = new Int32Array(n + 1);
  for (let k = 0; k < e; k++) inOffsets[outTarget[k] + 1]++;
  for (let i = 0; i < n; i++) inOffsets[i + 1] += inOffsets[i];
  const inSource = new Int32Array(e);
  const inEdge = new Int32Array(e);
  const inCursor = inOffsets.slice(0, n);
  for (let i = 0; i < n; i++) {
    for (let k = outOffsets[i]; k < outOffsets[i + 1]; k++) {
      const q = inCursor[outTarget[k]]++;
      inSource[q] = i;
      inEdge[q] = k;
    }
  }

  // Un CSR incohérent doit tomber ici, pas dix mille ticks plus tard.
  if (outOffsets[n] !== e || inOffsets[n] !== e) {
    throw new Error(`CSR incohérent : out=${outOffsets[n]} in=${inOffsets[n]} e=${e}`);
  }
  for (let i = 0; i < n; i++) {
    if (cursor[i] !== outOffsets[i + 1]) {
      throw new Error(`degré sortant non rempli pour le neurone ${i}`);
    }
  }

  return {
    n,
    e,
    regions,
    regionOf,
    sign,
    posX,
    posY,
    posZ,
    outOffsets,
    outTarget,
    outDelay,
    inOffsets,
    inSource,
    inEdge,
    w,
  };
}
