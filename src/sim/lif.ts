// Neurone « intègre-et-décharge à fuite » (LIF) à seuil adaptatif, et un tick d'activité.
// Pur : tout l'état est dans LifState, tout l'aléa vient du RNG passé en argument.
//
// ORDRE DU TICK, NON NÉGOCIABLE (une inversion change la dynamique) :
//   1. fuite du courant synaptique, puis livraisons dues et injection externe ;
//   2. intégration de la membrane pour les neurones actifs ;
//   3. franchissement du seuil → décharge, reset, réfractaire, saut de seuil ;
//   4. relaxation du seuil vers thrBase, pour tous ;
//   5. propagation des décharges dans le tampon circulaire, au délai de chaque arête.
//
// Le délai minimal valant 1, une décharge du tick t ne peut JAMAIS être consommée au tick t :
// c'est ce qui rend « avant » et « après » distinguables, prérequis de la STDP.

import type { RNG } from "../lib/rng";
import { gaussTable } from "./bruit";
import type { LifParams } from "./params";
import type { Topology } from "./topology";

export interface LifState {
  n: number;
  v: Float32Array;
  thr: Float32Array;
  iSyn: Float32Array;
  /** Courant externe imposé par les capteurs. Consommé et remis à zéro à chaque tick. */
  inject: Float32Array;
  refracLeft: Uint8Array;
  /** Neurones ayant déchargé au tick courant (les `spikeCount` premières entrées). */
  spikes: Int32Array;
  spikeCount: number;
  /** [n] 0/1 au tick courant, pour un test en O(1). */
  fired: Uint8Array;
  /** [n] compteur cumulé, remis à zéro par l'homéostasie. */
  spikeTotal: Int32Array;
  /** [ringDepth * n] livraisons différées : ring[(t % D) * n + cible]. */
  ring: Float32Array;
  ringDepth: number;
  /** Masque de lésion (lot 3) : 1 = neurone éteint. null = aucune lésion. */
  silenced: Uint8Array | null;
  t: number;
}

export function createLif(topo: Topology, p: LifParams): LifState {
  let dMax = 1;
  for (let e = 0; e < topo.e; e++) if (topo.outDelay[e] > dMax) dMax = topo.outDelay[e];
  const ringDepth = dMax + 1;
  const n = topo.n;
  return {
    n,
    v: new Float32Array(n).fill(p.vRest),
    thr: new Float32Array(n).fill(p.thrBase),
    iSyn: new Float32Array(n),
    inject: new Float32Array(n),
    refracLeft: new Uint8Array(n),
    spikes: new Int32Array(n),
    spikeCount: 0,
    fired: new Uint8Array(n),
    spikeTotal: new Int32Array(n),
    ring: new Float32Array(ringDepth * n),
    ringDepth,
    silenced: null,
    t: 0,
  };
}

/** Un tick d'activité. Renvoie le nombre de décharges. Mute `st` et lit `topo`. */
export function stepLif(topo: Topology, st: LifState, p: LifParams, rng: RNG): number {
  const n = st.n;
  const d = st.ringDepth;
  const base = (st.t % d) * n;
  const decayS = Math.exp(-1 / p.tauS);
  const invTauM = 1 / p.tauM;
  const invTauThr = 1 / p.tauThr;
  const sil = st.silenced;

  // Effacer les marques du tick précédent — sans balayer les n entrées.
  for (let k = 0; k < st.spikeCount; k++) st.fired[st.spikes[k]] = 0;
  st.spikeCount = 0;

  // 1) Courant : fuite, puis livraisons dues et injection externe.
  for (let i = 0; i < n; i++) {
    st.iSyn[i] = st.iSyn[i] * decayS + st.ring[base + i] + st.inject[i];
    st.ring[base + i] = 0;
    st.inject[i] = 0;
  }

  // 2-3) Intégration et seuil. Le bruit est tiré pour TOUS les neurones, y compris masqués
  // et réfractaires : sinon le flux du RNG dépendrait de l'état, et une lésion décalerait
  // tout le bruit du réseau, rendant les comparaisons du lot 3 impossibles.
  for (let i = 0; i < n; i++) {
    const bruit = p.noise > 0 ? p.noise * gaussTable(rng) : 0;
    if (sil !== null && sil[i] === 1) {
      st.v[i] = p.vReset;
      continue;
    }
    if (st.refracLeft[i] > 0) {
      st.refracLeft[i]--;
      st.v[i] = p.vReset;
      continue;
    }
    const v = st.v[i] + (-(st.v[i] - p.vRest) * invTauM + st.iSyn[i]) + bruit;
    if (v >= st.thr[i]) {
      st.v[i] = p.vReset;
      st.refracLeft[i] = p.refrac;
      st.thr[i] += p.thrJump;
      st.fired[i] = 1;
      st.spikes[st.spikeCount++] = i;
      st.spikeTotal[i]++;
    } else {
      st.v[i] = v;
    }
  }

  // 4) Relaxation du seuil vers sa valeur de base.
  for (let i = 0; i < n; i++) st.thr[i] += (p.thrBase - st.thr[i]) * invTauThr;

  // 5) Propagation, chaque arête à son délai.
  for (let k = 0; k < st.spikeCount; k++) {
    const i = st.spikes[k];
    const fin = topo.outOffsets[i + 1];
    for (let e = topo.outOffsets[i]; e < fin; e++) {
      st.ring[((st.t + topo.outDelay[e]) % d) * n + topo.outTarget[e]] += topo.w[e];
    }
  }

  st.t++;
  return st.spikeCount;
}

/** Taux de décharge moyen, en décharges par neurone et par tick, sur les `ticks` écoulés. */
export function meanRate(st: LifState, ticks: number): number {
  if (ticks <= 0) return 0;
  let total = 0;
  for (let i = 0; i < st.n; i++) total += st.spikeTotal[i];
  return total / (st.n * ticks);
}
