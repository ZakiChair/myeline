// La voie olfactive : glomérules → cellules de Kenyon → neurone de sortie (MBON),
// rétroaction APL, voie gustative. Lot 1 de la refonte — spec §3 et §9.
//
// TROIS DIFFÉRENCES STRUCTURELLES avec le cerveau « Vie » (`topology.ts`), toutes
// mesurées avant d'écrire ce fichier :
//
//   1. Pas de récurrence. C'est un circuit feed-forward : les seules arêtes plastiques
//      (KC → MBON) sont EN AVAL, donc la plasticité ne peut pas déstabiliser ce qui
//      l'alimente — §5.5 volet B, les rasters avec et sans plasticité sont identiques
//      au chiffre près. La stabilité est structurelle, pas entretenue : pas d'homéostasie.
//   2. La sparsité est imposée DANS le tick par la boucle APL (KC → APL → KC, délai 2),
//      jamais par réécriture de poids. Le gain règle le niveau — §5.5, monotone mesuré.
//   3. La plasticité est confinée : `plastSet` ne contient que les arêtes KC → MBON.
//
// Il n'existe aucun connectome chez l'espèce modèle : la correspondance se fait par
// populations nommées, effectifs et motifs de projection (spec §3). Ce qui n'est pas
// publié est étiqueté « inventé » dans params.ts.
//
// Positions (pour le rendu, jamais le câblage) : le calice est concentrique — rayon =
// horloge de naissance inversée, cellules les plus vieilles à l'extérieur, règle
// générative publiée (Farris et al. 1999). Les glomérules forment l'anneau d'entrée.

import { mulberry32, randInt, type RNG } from "../lib/rng";
import { createLif, stepLif, type LifState } from "./lif";
import {
  accumulateEligibility,
  addModulateurs,
  createPlasticity,
  type PlasticityState,
} from "./plasticity";
import type {
  LifParams,
  PlasticityParams,
  Region,
  VoieParams,
} from "./params";
import type { Topology } from "./topology";

/** Délai de la boucle de rétroaction APL, en ticks — celui de la sonde §5.5. */
const DELAI_APL = 2;

export interface BornesVoie {
  glom: Region;
  kc: Region;
  apl: Region;
  gust: Region;
  noci: Region;
  mbon: Region;
  ser: Region;
}

export interface Voie {
  topo: Topology;
  lif: LifState;
  plast: PlasticityState;
  params: VoieParams;
  lifParams: LifParams;
  plastParams: PlasticityParams;
  bornes: BornesVoie;
  /** Indices CSR des arêtes plastiques — KC → MBON (canal OA) et KC → SER (canal DA). */
  plastSet: Int32Array;
  /** Arêtes plastiques par canal : `oa` → MBON, `da` → SER. Mesure de sélectivité. */
  plastParCanal: { oa: Int32Array; da: Int32Array };
  /**
   * Lésions des canaux de modulation (rang 3) : un canal coupé ne consolide plus
   * rien — l'injection sensorielle et le réflexe inné, eux, restent intacts. C'est
   * la lecture fidèle des bloqueurs pharmacologiques publiés.
   */
  lesions: { oa: boolean; da: boolean };
  /** Flux de bruit des neurones ajoutés au rang 3 (NOCI, SER) — isole le flux
   *  historique : mêmes graines ⇒ mêmes trajectoires que sans ces régions. */
  rngBruitSer: RNG;
}

/** Découpe les populations. KC reçoit tout ce qui reste après les régions
 *  HISTORIQUES — NOCI et SER (rang 3) s'ajoutent AU-DELÀ de p.n : le compte de KC
 *  et le câblage restent bit-identiques aux portes déjà passées. */
function decouperVoie(p: VoieParams): BornesVoie {
  const nGlomNeurones = p.nGlom * p.pnParGlom;
  const nFixe = nGlomNeurones + 1 + p.nGust + p.nMBON;
  const nKC = p.n - nFixe;
  if (nKC < 100) {
    throw new Error(`n = ${p.n} trop petit : il resterait ${nKC} cellules de Kenyon`);
  }
  let start = 0;
  const reg = (id: Region["id"], pools: number, poolSize: number): Region => {
    const r: Region = { id, start, count: pools * poolSize, pools, poolSize };
    start += r.count;
    return r;
  };
  const glom = reg("GLOM", p.nGlom, p.pnParGlom);
  const kc = reg("KC", 1, nKC);
  const apl = reg("APL", 1, 1);
  const gust = reg("GUST", 1, p.nGust);
  const mbon = reg("MBON", 1, p.nMBON);
  // NOCI et SER à la FIN de l'ordre : stepLif tire le bruit par neurone dans
  // l'ordre des indices — les populations historiques gardent leurs tirages et
  // la dynamique reste bit-identique aux portes déjà passées.
  const noci = reg("NOCI", 1, p.nNoci);
  const ser = reg("SER", 1, p.nSer);
  return { glom, kc, apl, gust, noci, mbon, ser };
}

/**
 * Construit la topologie de la voie. Déterministe : même graine ⇒ même câblage.
 *
 * Ordre des neurones : [GLOM][KC][APL][GUST][MBON]. Les arêtes :
 *   PN → KC        (kAff glomérules distincts par KC, tirés puis un PN au hasard)
 *   KC → APL       (toutes ; excitatrice)
 *   APL → KC       (toutes ; inhibitrice — signe de l'APL, loi de Dale)
 *   KC → MBON      (jusqu'à kOut sorties par KC — couche plastique, canal OA)
 *   KC → SER       (une par KC — couche plastique, canal DA — rang 3)
 *   GUST → MBON    (toutes ; le réflexe inconditionnel appétitif, fixe et fort)
 *   NOCI → SER     (toutes ; le réflexe inconditionnel aversif, fixe et fort)
 */
export function buildVoie(p: VoieParams): {
  topo: Topology;
  bornes: BornesVoie;
  plastSet: Int32Array;
  plastSrc: Int32Array;
  plastChannel: Uint8Array;
  plastParCanal: { oa: Int32Array; da: Int32Array };
} {
  if (p.gainAPL > 50) {
    throw new Error(
      `gainAPL = ${p.gainAPL} : au-delà de 50 la boucle oscille (alternance mesurée ≈ 12× le gain utile, §5.5)`,
    );
  }
  const rng = mulberry32(p.seed);
  // Flux dédié aux arêtes KC → SER : le câblage PN → KC et KC → MBON consomme le
  // même nombre de tirages du flux principal qu'avant le rang 3 — mêmes graines ⇒
  // réseaux identiques aux portes déjà passées (les arêtes SER sont des puits,
  // elles ne réinjectent rien dans la dynamique vue par le MBON).
  const rngSer = mulberry32(p.seed ^ 0x5e19);
  const b = decouperVoie(p);
  const n = p.n + p.nNoci + p.nSer; // les régions du rang 3 s'ajoutent au-delà de p.n

  const regions = [b.glom, b.kc, b.apl, b.gust, b.mbon, b.noci, b.ser];
  const regionOf = new Uint8Array(n);
  regions.forEach((r, ri) => regionOf.fill(ri, r.start, r.start + r.count));

  // Loi de Dale : tout est excitateur sauf l'APL.
  const sign = new Int8Array(n).fill(1);
  sign[b.apl.start] = -1;

  // ── Positions (rendu, pas câblage). Calice concentrique : le rayon est l'horloge de
  // naissance inversée — neurone k (ordre de naissance) à r = R·√(1 − k/nKC), spirale
  // d'angle d'or. Les plus vieilles sont dehors, la prolifération au centre (publié).
  const posX = new Float32Array(n);
  const posY = new Float32Array(n);
  const posZ = new Float32Array(n);
  const R = Math.cbrt(b.kc.count) * 0.9;
  const PHI = 2.399963229728653; // angle d'or, littéral
  for (let k = 0; k < b.kc.count; k++) {
    const i = b.kc.start + k;
    const u = k / b.kc.count;
    const r = R * Math.sqrt(1 - u);
    const a = k * PHI;
    posX[i] = r * Math.cos(a);
    posY[i] = r * Math.sin(a);
    // Coupe peu profonde : le calice est une calotte, pas un disque.
    posZ[i] = (u - 0.5) * R * 0.3;
  }
  for (let g = 0; g < p.nGlom; g++) {
    const ang = (2 * Math.PI * g) / p.nGlom;
    for (let k = 0; k < p.pnParGlom; k++) {
      const i = b.glom.start + g * p.pnParGlom + k;
      posX[i] = (R * 1.25 + k * 0.15) * Math.cos(ang);
      posY[i] = (R * 1.25 + k * 0.15) * Math.sin(ang);
      posZ[i] = R * 0.45;
    }
  }
  posX[b.apl.start] = 0;
  posY[b.apl.start] = 0;
  posZ[b.apl.start] = -R * 0.35;
  for (let k = 0; k < p.nGust; k++) {
    posX[b.gust.start + k] = (k - p.nGust / 2) * 0.4;
    posY[b.gust.start + k] = 0;
    posZ[b.gust.start + k] = -R * 0.9;
  }
  for (let k = 0; k < p.nNoci; k++) {
    posX[b.noci.start + k] = (k - p.nNoci / 2) * 0.4;
    posY[b.noci.start + k] = R * 0.5;
    posZ[b.noci.start + k] = -R * 0.9;
  }
  for (let k = 0; k < p.nMBON; k++) {
    posX[b.mbon.start + k] = (k - p.nMBON / 2) * 0.6;
    posY[b.mbon.start + k] = -R * 0.3;
    posZ[b.mbon.start + k] = R * 0.8;
  }
  for (let k = 0; k < p.nSer; k++) {
    posX[b.ser.start + k] = (k - p.nSer / 2) * 0.6;
    posY[b.ser.start + k] = R * 0.3;
    posZ[b.ser.start + k] = R * 0.8;
  }

  // ── Passe 1 : degrés sortants.
  const outOffsets = new Int32Array(n + 1);
  const nSortieParKC = Math.min(p.kOut, p.nMBON);
  for (let i = b.glom.start; i < b.glom.start + b.glom.count; i++) {
    // rempli passe 2 (voir afférences ci-dessous) — degré par PN posé plus bas.
  }
  // Les afférences sont tirées par le KC : il faut d'abord savoir quels PN projettent.
  const affPN = new Int32Array(b.kc.count * p.kAff);
  for (let k = 0; k < b.kc.count; k++) {
    // kAff glomérules DISTINCTS (tirage sans remise), puis un PN du pool de chacun.
    const choisis = new Int32Array(p.nGlom);
    for (let q = 0; q < p.nGlom; q++) choisis[q] = q;
    for (let q = 0; q < p.kAff; q++) {
      const j = q + randInt(rng, 0, p.nGlom - 1 - q);
      const g = choisis[j];
      choisis[j] = choisis[q];
      choisis[q] = g;
      affPN[k * p.kAff + q] = b.glom.start + g * p.pnParGlom + randInt(rng, 0, p.pnParGlom - 1);
    }
  }
  for (let k = 0; k < affPN.length; k++) outOffsets[affPN[k] + 1]++;
  for (let i = b.kc.start; i < b.kc.start + b.kc.count; i++) {
    outOffsets[i + 1] = 1 + nSortieParKC + p.nSer; // → APL, → MBON, → SER
  }
  outOffsets[b.apl.start + 1] = b.kc.count; // APL → tous les KC
  for (let i = b.gust.start; i < b.gust.start + b.gust.count; i++) {
    outOffsets[i + 1] = p.nMBON;
  }
  for (let i = b.noci.start; i < b.noci.start + b.noci.count; i++) {
    outOffsets[i + 1] = p.nSer;
  }
  for (let i = 0; i < n; i++) outOffsets[i + 1] += outOffsets[i];
  const e = outOffsets[n];

  // ── Passe 2 : remplissage.
  const outTarget = new Int32Array(e);
  const outDelay = new Uint8Array(e);
  const w = new Float32Array(e);
  const cursor = outOffsets.slice(0, n);
  const ecrire = (src: number, cible: number, poids: number, delai: number) => {
    const k = cursor[src]++;
    outTarget[k] = cible;
    outDelay[k] = delai;
    w[k] = poids;
  };

  for (let k = 0; k < affPN.length; k++) {
    ecrire(affPN[k], b.kc.start + Math.floor(k / p.kAff), p.wGK, randInt(rng, 1, p.delayMax));
  }
  // Deux couches plastiques par KC : → MBON (canal 1 = OA, appétitif) et → SER
  // (canal 2 = DA, aversif). Chacune ne consolide que sous son modulateur.
  const plastOA = new Int32Array(b.kc.count * nSortieParKC);
  const plastDA = new Int32Array(b.kc.count * p.nSer);
  // Source de chaque arête plastique, alignée sur plastSet — la porte de fraîcheur
  // (fraisMin, rang 5) borne la consolidation aux prés récents.
  const plastSrc = new Int32Array(plastOA.length + plastDA.length);
  let qOA = 0;
  let qDA = 0;
  for (let k = 0; k < b.kc.count; k++) {
    const i = b.kc.start + k;
    ecrire(i, b.apl.start, p.wKA, DELAI_APL);
    for (let q = 0; q < nSortieParKC; q++) {
      const cible =
        nSortieParKC === p.nMBON
          ? b.mbon.start + q
          : b.mbon.start + randInt(rng, 0, p.nMBON - 1);
      plastOA[qOA] = cursor[i]; // l'écriture qui suit est l'arête plastique
      plastSrc[qOA++] = i;
      ecrire(i, cible, p.w0, randInt(rng, 1, p.delayMax));
    }
    for (let q = 0; q < p.nSer; q++) {
      plastDA[qDA] = cursor[i];
      plastSrc[plastOA.length + qDA++] = i;
      ecrire(i, b.ser.start + q, p.w0, randInt(rngSer, 1, p.delayMax));
    }
  }
  const wAK = -p.wKA * p.gainAPL;
  for (let k = 0; k < b.kc.count; k++) ecrire(b.apl.start, b.kc.start + k, wAK, DELAI_APL);
  for (let i = b.gust.start; i < b.gust.start + b.gust.count; i++) {
    for (let q = 0; q < p.nMBON; q++) ecrire(i, b.mbon.start + q, p.wGust, 1);
  }
  for (let i = b.noci.start; i < b.noci.start + b.noci.count; i++) {
    for (let q = 0; q < p.nSer; q++) ecrire(i, b.ser.start + q, p.wNoci, 1);
  }

  const plast = new Int32Array(plastOA.length + plastDA.length);
  plast.set(plastOA);
  plast.set(plastDA, plastOA.length);
  const plastChannel = new Uint8Array(e); // 0 partout → canal OA par défaut
  for (let q = 0; q < plastDA.length; q++) plastChannel[plastDA[q]] = 2;

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
  if (outOffsets[n] !== e || inOffsets[n] !== e) {
    throw new Error(`CSR incohérent : out=${outOffsets[n]} in=${inOffsets[n]} e=${e}`);
  }
  for (let i = 0; i < n; i++) {
    if (cursor[i] !== outOffsets[i + 1]) {
      throw new Error(`degré sortant non rempli pour le neurone ${i}`);
    }
  }

  return {
    topo: {
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
    },
    bornes: b,
    plastSet: plast,
    plastSrc,
    plastChannel,
    plastParCanal: { oa: plastOA, da: plastDA },
  };
}

export function createVoie(
  p: VoieParams,
  lifParams: LifParams,
  plastParams: PlasticityParams,
): Voie {
  const { topo, bornes, plastSet, plastSrc, plastChannel, plastParCanal } = buildVoie(p);
  return {
    topo,
    lif: createLif(topo, lifParams),
    plast: createPlasticity(topo, plastParams, plastSet, plastChannel, plastSrc),
    params: p,
    lifParams,
    plastParams,
    bornes,
    plastSet,
    plastParCanal,
    lesions: { oa: false, da: false },
    rngBruitSer: mulberry32(p.seed ^ 0xb11),
  };
}

/**
 * Un tick de la voie : activité, éligibilité, puis les modulateurs du tick (0 en
 * dehors du renforcement — le déversement cadencé y purge l'éligibilité périmée,
 * ce qui garde les essais indépendants). `oa` = canal appétitif (sucrose),
 * `da` = canal aversif (choc) — une lésion masque son canal à la consolidation,
 * sans toucher ni l'autre canal ni le réflexe inné. AUCUNE homéostasie : la
 * stabilité est structurelle (§5.5).
 */
export function stepVoie(
  v: Voie,
  rng: RNG,
  oa: number,
  da = 0,
  odeurCourante = 0,
  odeurUS = 0,
): number {
  stepLif(v.topo, v.lif, v.lifParams, rng, v.rngBruitSer, v.bornes.noci.start);
  // Chaque écriture d'éligibilité est étiquetée par l'odeur injectée ce tick —
  // dans le monde dense, la dominance au contact est partagée et le temps seul
  // ne sépare pas l'odeur causale de l'événement.
  accumulateEligibility(v.topo, v.lif, v.plast, v.plastParams, odeurCourante);
  addModulateurs(
    v.topo,
    v.lif,
    v.plast,
    v.plastParams,
    v.lesions.oa ? 0 : oa,
    v.lesions.da ? 0 : da,
    undefined,
    odeurUS,
  );
  return v.lif.spikeCount;
}

/**
 * Injecte l'odeur dans le lobe antennaire : chaque glomérule porte une intensité de
 * `odeur[g]`, appliquée à tous ses neurones de projection. Consommé au prochain tick.
 */
export function injecterOdeur(v: Voie, odeur: Float32Array, gain: number): void {
  const { glom } = v.bornes;
  for (let g = 0; g < v.params.nGlom; g++) {
    const valeur = gain * odeur[g];
    if (valeur <= 0) continue;
    const start = glom.start + g * glom.poolSize;
    for (let i = start; i < start + glom.poolSize; i++) v.lif.inject[i] += valeur;
  }
}

/** Le stimulus inconditionnel appétitif : injection directe dans la voie gustative. */
export function injecterGust(v: Voie, gain: number): void {
  const { gust } = v.bornes;
  for (let i = gust.start; i < gust.start + gust.count; i++) v.lif.inject[i] += gain;
}

/** Le stimulus inconditionnel aversif : le choc, dans la voie nociceptive. */
export function injecterChoc(v: Voie, gain: number): void {
  const { noci } = v.bornes;
  for (let i = noci.start; i < noci.start + noci.count; i++) v.lif.inject[i] += gain;
}

/** Décharges des neurones de sortie AU TICK COURANT — la réponse en train de se former. */
export function dechargesSortie(v: Voie): number {
  const { mbon } = v.bornes;
  let c = 0;
  for (let i = mbon.start; i < mbon.start + mbon.count; i++) c += v.lif.fired[i];
  return c;
}

/** Décharges de la sortie défensive (SER) au tick courant. */
export function dechargesSer(v: Voie): number {
  const { ser } = v.bornes;
  let c = 0;
  for (let i = ser.start; i < ser.start + ser.count; i++) c += v.lif.fired[i];
  return c;
}

/** Décharges des cellules de Kenyon au tick courant — pour la mesure de sparsité. */
export function dechargesKC(v: Voie): number {
  const { kc } = v.bornes;
  let c = 0;
  for (let i = kc.start; i < kc.start + kc.count; i++) c += v.lif.fired[i];
  return c;
}
