// Plasticité à trois facteurs : traces de décharge, éligibilité par synapse, dopamine.
//
// C'est le module qui franchit le mur du crédit documenté par le parcours /theorie. La
// synapse ne garde pas « j'ai été renforcée » mais « j'ai peut-être contribué » (l'éligibilité) ;
// le neuromodulateur, arrivant plus tard, décide si ça valait la peine.
//
//   décharge de i → pour chaque sortie e = i→j : elig[e] -= aMinus · postTrace[j]   (LTD)
//   décharge de j → pour chaque entrée e = i→j : elig[e] += aPlus  · preTrace[i]    (LTP)
//   à la dopamine → w[e] += lr · da · elig[e]
//
// Sans dopamine, rien n'est appris : l'éligibilité s'évanouit.
//
// DEUX DÉCISIONS STRUCTURANTES :
//
// 1. La plasticité ne s'applique QU'AUX arêtes dont la source est excitatrice. Les poids
//    inhibiteurs sont fixés à la construction. Cela préserve la loi de Dale sans clamp
//    acrobatique et retire 20 % du travail au balayage.
//
// 2. Le déversement dopaminergique balaye les arêtes, applique la mise à jour ET
//    réinitialise `lastTouch`. Conséquence : l'âge d'une trace ne dépasse jamais `dumpEvery`.
//    Le « on ne paie que les arêtes actives » de la conception décrit donc le travail ENTRE
//    deux déversements, pas le balayage lui-même. La table de décroissance est malgré tout
//    dimensionnée à 4·tauElig, ce qui reste correct si un déversement survient hors cadence.

import type { LifState } from "./lif";
import type { PlasticityParams } from "./params";
import type { Topology } from "./topology";

export interface PlasticityState {
  /** [n] traces de décharge, décroissance tauPre / tauPost. */
  preTrace: Float32Array;
  postTrace: Float32Array;
  /** [e] trace d'éligibilité par synapse : la coïncidence causale, pas encore le poids. */
  elig: Float32Array;
  /** [e] tick du dernier accès à l'arête (décroissance paresseuse). */
  lastTouch: Int32Array;
  /** Table de décroissance de l'éligibilité, saturée à 0 au-delà de 4·tauElig. */
  lut: Float32Array;
  /** [n] valeur de spikeTotal au dernier passage de l'homéostasie. */
  spikeAtLastHomeo: Int32Array;
  daAccum: number;
  lastDump: number;
  lastHomeo: number;
}

export function createPlasticity(topo: Topology, p: PlasticityParams): PlasticityState {
  const taille = 4 * p.tauElig + 1;
  const lut = new Float32Array(taille);
  for (let k = 0; k < taille; k++) lut[k] = k >= 4 * p.tauElig ? 0 : Math.exp(-k / p.tauElig);
  return {
    preTrace: new Float32Array(topo.n),
    postTrace: new Float32Array(topo.n),
    elig: new Float32Array(topo.e),
    lastTouch: new Int32Array(topo.e),
    lut,
    spikeAtLastHomeo: new Int32Array(topo.n),
    daAccum: 0,
    lastDump: 0,
    lastHomeo: 0,
  };
}

/** Décroît l'éligibilité d'une arête jusqu'au tick courant et renvoie sa valeur à jour. */
function toucher(ps: PlasticityState, e: number, t: number): number {
  const age = t - ps.lastTouch[e];
  if (age > 0) {
    ps.elig[e] *= age >= ps.lut.length ? 0 : ps.lut[age];
    ps.lastTouch[e] = t;
  }
  return ps.elig[e];
}

/**
 * Met à jour l'éligibilité à partir des décharges du tick, puis les traces. À appeler APRÈS
 * `stepLif`. L'ordre compte : mettre les traces à jour d'abord ferait qu'un neurone se
 * compterait lui-même, et la dépression dégénérerait sur un seul tick.
 */
export function accumulateEligibility(
  topo: Topology,
  lif: LifState,
  ps: PlasticityState,
  p: PlasticityParams,
): void {
  const t = lif.t;
  const nb = lif.spikeCount;

  // (a) Dépression : la source vient de décharger, on pénalise ses cibles déjà actives.
  for (let k = 0; k < nb; k++) {
    const i = lif.spikes[k];
    if (topo.sign[i] !== 1) continue;
    const fin = topo.outOffsets[i + 1];
    for (let e = topo.outOffsets[i]; e < fin; e++) {
      const post = ps.postTrace[topo.outTarget[e]];
      if (post === 0) continue;
      toucher(ps, e, t);
      ps.elig[e] -= p.aMinus * post;
    }
  }

  // (b) Potentialisation : la cible vient de décharger, on crédite ses sources récentes.
  for (let k = 0; k < nb; k++) {
    const j = lif.spikes[k];
    const fin = topo.inOffsets[j + 1];
    for (let q = topo.inOffsets[j]; q < fin; q++) {
      const src = topo.inSource[q];
      if (topo.sign[src] !== 1) continue;
      const pre = ps.preTrace[src];
      if (pre === 0) continue;
      const e = topo.inEdge[q];
      toucher(ps, e, t);
      ps.elig[e] += p.aPlus * pre;
    }
  }

  // (c) Traces : marquer les décharges du tick, puis décroissance globale.
  for (let k = 0; k < nb; k++) {
    const i = lif.spikes[k];
    ps.preTrace[i] += 1;
    ps.postTrace[i] += 1;
  }
  const dPre = Math.exp(-1 / p.tauPre);
  const dPost = Math.exp(-1 / p.tauPost);
  for (let i = 0; i < topo.n; i++) {
    ps.preTrace[i] *= dPre;
    ps.postTrace[i] *= dPost;
  }
}

/**
 * Ajoute de la dopamine et déverse si la cadence ou le seuil l'impose. Renvoie true si un
 * déversement a eu lieu. `observer` sert aux tests : il reçoit chaque arête touchée et son
 * éligibilité à jour, avant application.
 */
export function addDopamine(
  topo: Topology,
  lif: LifState,
  ps: PlasticityState,
  p: PlasticityParams,
  da: number,
  observer?: (e: number, elig: number) => void,
): boolean {
  ps.daAccum += da;
  const echu = lif.t - ps.lastDump >= p.dumpEvery;
  if (!echu && Math.abs(ps.daAccum) < p.dumpNow) return false;

  const t = lif.t;
  const d = ps.daAccum;
  ps.daAccum = 0;
  ps.lastDump = t;

  // Balayage par source : on retrouve le signe sans tableau `edgeSource` supplémentaire
  // (12 Mo économisés à n = 50 000). Les arêtes inhibitrices n'accumulent jamais
  // d'éligibilité, donc les sauter ne perd rien.
  const gain = p.lr * d;
  for (let i = 0; i < topo.n; i++) {
    if (topo.sign[i] !== 1) continue;
    const fin = topo.outOffsets[i + 1];
    for (let e = topo.outOffsets[i]; e < fin; e++) {
      const el = toucher(ps, e, t);
      if (observer) observer(e, el);
      if (el === 0) continue;
      let nw = topo.w[e] + gain * el;
      if (nw < 0) nw = 0;
      else if (nw > p.wMax) nw = p.wMax;
      topo.w[e] = nw;
      ps.elig[e] = 0;
    }
  }
  return true;
}

/**
 * Mise à l'échelle multiplicative des poids entrants EXCITATEURS de chaque neurone, vers un
 * taux de décharge cible. Sans elle, un réseau de cette taille soumis à une plasticité
 * récompensée part en crise ou s'éteint : ce n'est pas un réglage fin, c'est ce qui rend le
 * régime viable.
 *
 * Le comptage se fait sur sa PROPRE fenêtre (`spikeAtLastHomeo`) et laisse `lif.spikeTotal`
 * cumulatif intact — celui-ci sert aussi aux statistiques du lot 3.
 */
export function homeostasis(
  topo: Topology,
  lif: LifState,
  ps: PlasticityState,
  p: PlasticityParams,
  tauxCible: number,
): void {
  const fenetre = Math.max(1, lif.t - ps.lastHomeo);
  const bas = 1 - p.homeoClamp;
  const haut = 1 + p.homeoClamp;
  for (let j = 0; j < topo.n; j++) {
    const nb = lif.spikeTotal[j] - ps.spikeAtLastHomeo[j];
    ps.spikeAtLastHomeo[j] = lif.spikeTotal[j];
    const observe = nb / fenetre;
    let f = 1 + (p.homeoRate * (tauxCible - observe)) / tauxCible;
    if (f < bas) f = bas;
    else if (f > haut) f = haut;
    if (f === 1) continue;
    const fin = topo.inOffsets[j + 1];
    for (let q = topo.inOffsets[j]; q < fin; q++) {
      const e = topo.inEdge[q];
      if (topo.w[e] <= 0) continue;
      const nw = topo.w[e] * f;
      topo.w[e] = nw > p.wMax ? p.wMax : nw;
    }
  }
  ps.lastHomeo = lif.t;
}
