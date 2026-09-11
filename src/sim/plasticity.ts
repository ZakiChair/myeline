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
  /**
   * [e] 1 = l'arête peut porter de l'éligibilité. null = toutes les arêtes à source
   * excitatrice (comportement du lot 0). Le confinement à une seule couche — cellules de
   * Kenyon → neurones de sortie — est la correction structurelle du lot 1 de la refonte.
   */
  plastFlag: Uint8Array | null;
  /**
   * Liste compacte des arêtes plastiques : le déversement dopaminergique ne balaie qu'elle
   * quand elle existe, au lieu de tout le CSR sortant.
   */
  plastSet: Int32Array | null;
  /**
   * [e] canal de modulation qui consolide l'arête : 0 ou absent = canal appétitif
   * (octopamine — d1), 2 = canal aversif (dopamine — d2). Rang 3 : les deux voies sont
   * lésables SÉPARÉMENT — une lésion coupe un canal sans toucher l'autre.
   */
  plastChannel: Uint8Array | null;
  /**
   * [q] source de la q-ème arête de `plastSet` — sert à la porte de fraîcheur
   * `fraisMin` : une arête ne consolide que si sa source a déchargé récemment.
   * Rang 5 : l'éligibilité intègre toute l'histoire depuis le dernier événement du
   * canal — les marques de l'autre odeur y survivent et se font consolider au
   * contact (mesuré : l'aversif apprenait la nourriture). La porte borne le crédit
   * aux prés frais — dominés par la pastille touchée.
   */
  plastSrc: Int32Array | null;
  /**
   * [e] odeur sous laquelle l'éligibilité de l'arête a été écrite en dernier :
   * 0 = rien, 1 = nourriture, 2 = toxine. Rang 5 : dans le monde dense, les deux
   *  odeurs partagent la dominance presque moitié-moitié au contact — le temps
   *  seul ne sépare pas l'odeur causale. Un événement ne consolide que les
   *  marques écrites sous SON odeur.
   */
  eligOdeur: Int8Array | null;
  /** Accumulateur du canal appétitif (OA). */
  daAccum: number;
  /** Accumulateur du canal aversif (DA). */
  daAccum2: number;
  lastDump: number;
  lastHomeo: number;
}

export function createPlasticity(
  topo: Topology,
  p: PlasticityParams,
  plastSet: Int32Array | null = null,
  plastChannel: Uint8Array | null = null,
  plastSrc: Int32Array | null = null,
): PlasticityState {
  const eligOdeur = plastSet !== null ? new Int8Array(topo.e) : null;
  const taille = 4 * p.tauElig + 1;
  const lut = new Float32Array(taille);
  for (let k = 0; k < taille; k++) lut[k] = k >= 4 * p.tauElig ? 0 : Math.exp(-k / p.tauElig);
  let plastFlag: Uint8Array | null = null;
  if (plastSet !== null) {
    plastFlag = new Uint8Array(topo.e);
    for (let q = 0; q < plastSet.length; q++) plastFlag[plastSet[q]] = 1;
  }
  return {
    preTrace: new Float32Array(topo.n),
    postTrace: new Float32Array(topo.n),
    elig: new Float32Array(topo.e),
    lastTouch: new Int32Array(topo.e),
    lut,
    spikeAtLastHomeo: new Int32Array(topo.n),
    plastFlag,
    plastSet,
    plastChannel,
    plastSrc,
    eligOdeur,
    daAccum: 0,
    daAccum2: 0,
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
  odeurCourante = 0,
): void {
  const t = lif.t;
  const nb = lif.spikeCount;
  const tag = ps.eligOdeur;

  // (a) Dépression : la source vient de décharger, on pénalise ses cibles déjà actives.
  for (let k = 0; k < nb; k++) {
    const i = lif.spikes[k];
    if (topo.sign[i] !== 1) continue;
    const fin = topo.outOffsets[i + 1];
    for (let e = topo.outOffsets[i]; e < fin; e++) {
      if (ps.plastFlag !== null && ps.plastFlag[e] === 0) continue;
      const post = ps.postTrace[topo.outTarget[e]];
      if (post === 0) continue;
      toucher(ps, e, t);
      // Changement d'odeur : les marques d'une autre odeur ne valent pas pour
      // l'événement à venir — l'éligibilité est pure-odeur.
      if (tag !== null && tag[e] !== odeurCourante) ps.elig[e] = 0;
      ps.elig[e] -= p.aMinus * post;
      if (tag !== null) tag[e] = odeurCourante;
    }
  }

  // (b) Potentialisation : la cible vient de décharger, on crédite ses sources récentes.
  for (let k = 0; k < nb; k++) {
    const j = lif.spikes[k];
    const fin = topo.inOffsets[j + 1];
    for (let q = topo.inOffsets[j]; q < fin; q++) {
      const src = topo.inSource[q];
      if (topo.sign[src] !== 1) continue;
      const e = topo.inEdge[q];
      if (ps.plastFlag !== null && ps.plastFlag[e] === 0) continue;
      const pre = ps.preTrace[src];
      if (pre === 0) continue;
      toucher(ps, e, t);
      if (tag !== null && tag[e] !== odeurCourante) ps.elig[e] = 0;
      ps.elig[e] += p.aPlus * pre;
      if (tag !== null) tag[e] = odeurCourante;
    }
  }

  // (b') Trace de stimulus (mode monde) : chaque arête plastique dont la source a
  // été active récemment accumule une marque étiquetée par l'odeur courante — la
  // coïncidence avec la sortie n'est pas requise : la sortie naïve tire trop
  // rarement pour densifier les marques (mesuré : elig ~0,02 sans contraste).
  if (p.eligTrace && tag !== null && odeurCourante > 0 && ps.plastSrc !== null) {
    const set = ps.plastSet!;
    const srcs = ps.plastSrc;
    for (let q = 0; q < set.length; q++) {
      const tr = ps.preTrace[srcs[q]];
      // Porte d'écriture : la trace doit refléter une source VRAIMENT active, pas
      // un tir spontané — sinon le fond accumule des marques étiquetées qui
      // franchissent le plancher de consolidation (mesuré : w(MBON) toxine ≈ 1,2).
      if (tr <= 0 || tr < p.fraisMin) continue;
      const e = set[q];
      toucher(ps, e, t);
      if (tag[e] !== odeurCourante) ps.elig[e] = 0;
      ps.elig[e] += p.aPlus * tr;
      tag[e] = odeurCourante;
    }
  }

  // (c) Traces : marquer les décharges du tick, puis décroissance globale.
  for (let k = 0; k < nb; k++) {
    const i = lif.spikes[k];
    ps.preTrace[i] += 1;
    ps.postTrace[i] += 1;
  }
  // Même écart assumé, et même raison, qu'à lif.ts : invariants de boucle, donc une divergence
  // inter-moteurs se verrait dès le premier tick. Voir le commentaire de `decayS` dans stepLif.
  const dPre = Math.exp(-1 / p.tauPre);
  const dPost = Math.exp(-1 / p.tauPost);
  for (let i = 0; i < topo.n; i++) {
    ps.preTrace[i] *= dPre;
    ps.postTrace[i] *= dPost;
  }
}

/**
 * Ajoute un modulateur par canal — `oa` = canal appétitif (octopamine), `da` = canal
 * aversif (dopamine) — et déverse si la cadence ou le seuil l'impose. Chaque arête ne
 * consolide que sous le canal qui le gouverne (`plastChannel`) ; l'éligibilité d'une
 * arête n'est consommée que par une vraie consolidation SUR SON canal.
 *
 * `addDopamine` (ci-dessous) garde la signature historique : canal appétitif seul,
 * comportement du lot 0 inchangé.
 */
export function addModulateurs(
  topo: Topology,
  lif: LifState,
  ps: PlasticityState,
  p: PlasticityParams,
  oa: number,
  da: number,
  observer?: (e: number, elig: number) => void,
  odeurUS = 0,
): boolean {
  ps.daAccum += oa;
  ps.daAccum2 += da;
  const echu = lif.t - ps.lastDump >= p.dumpEvery;
  if (!echu && Math.abs(ps.daAccum) < p.dumpNow && Math.abs(ps.daAccum2) < p.dumpNow) {
    return false;
  }

  const t = lif.t;
  const d1 = ps.daAccum;
  const d2 = ps.daAccum2;
  ps.daAccum = 0;
  ps.daAccum2 = 0;
  ps.lastDump = t;
  // Une marque d'éligibilité n'est consommée que par une VRAIE consolidation (d ≠ 0)
  // SUR LE CANAL DE L'ARÊTE : un déversement à modulateur nul ne doit pas l'effacer —
  // sinon la fenêtre de crédit effective vaut dumpEvery, pas tauElig. Mesuré au lot 1
  // de la refonte : avec la remise à zéro inconditionnelle, l'éligibilité d'un CS
  // mourait tous les 250 ticks et l'ISI de 3 000 n'était jamais franchi par la marque.
  // Avec deux canaux, la règle s'applique par canal : un événement aversif ne consomme
  // pas les marques des arêtes appétitives (elles peuvent encore être consolidées plus
  // tard par un événement appétitif dans la fenêtre).
  const appliquer = (e: number, credit?: number): void => {
    const canal = ps.plastChannel === null ? 0 : ps.plastChannel[e];
    const d = canal === 2 ? d2 : d1;
    const el = credit ?? toucher(ps, e, t);
    if (observer) observer(e, el);
    if (Math.abs(el) < p.seuilElig || el === 0) return;
    let nw = topo.w[e] + p.lr * d * el;
    if (nw < 0) nw = 0;
    else if (nw > p.wMax) nw = p.wMax;
    topo.w[e] = nw;
    if (d !== 0) ps.elig[e] = 0;
  };

  // Plasticité confinée : on ne balaie que l'ensemble déclaré (lot 1 — une seule couche
  // apprend). Hors confinement, balayage par source : on retrouve le signe sans tableau
  // `edgeSource` supplémentaire (12 Mo économisés à n = 50 000), et les arêtes inhibitrices
  // n'accumulent jamais d'éligibilité, donc les sauter ne perd rien.
  if (ps.plastSet !== null) {
    const set = ps.plastSet;
    const srcs = ps.plastSrc;
    for (let q = 0; q < set.length; q++) {
      const e = set[q];
      // Porte de fraîcheur : seules les arêtes dont la source a déchargé dans la
      // fenêtre de trace pré (~tauPre) consolident — le crédit va à l'odeur
      // causale, pas à l'intégrale d'histoire.
      if (srcs !== null && p.fraisMin > 0 && ps.preTrace[srcs[q]] < p.fraisMin) continue;
      // Porte d'odeur : un événement ne consolide que les marques écrites sous SON
      // odeur — dans le monde dense les deux odeurs partagent la dominance au
      // contact, le temps seul ne sépare pas la cause (mesuré : sans ça, le canal
      // aversif apprenait la nourriture).
      if (odeurUS > 0 && ps.eligOdeur !== null && ps.eligOdeur[e] !== odeurUS) continue;
      appliquer(e);
    }
    return true;
  }

  for (let i = 0; i < topo.n; i++) {
    if (topo.sign[i] !== 1) continue;
    const fin = topo.outOffsets[i + 1];
    for (let e = topo.outOffsets[i]; e < fin; e++) appliquer(e);
  }
  return true;
}

/**
 * Ajoute de la dopamine (canal appétitif, le modulateur historique du projet) et
 * déverse si la cadence ou le seuil l'impose. Renvoie true si un déversement a eu lieu.
 * `observer` sert aux tests : il reçoit chaque arête touchée et son éligibilité à jour,
 * avant application.
 */
export function addDopamine(
  topo: Topology,
  lif: LifState,
  ps: PlasticityState,
  p: PlasticityParams,
  da: number,
  observer?: (e: number, elig: number) => void,
): boolean {
  return addModulateurs(topo, lif, ps, p, da, 0, observer);
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
