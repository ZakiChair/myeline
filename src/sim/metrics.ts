// Statistiques comportementales : durées de vie, ratio toxine, énergie moyenne.
// Aucune assertion ici — ce module mesure, les sondes jugent.

import type { WorldEventKind } from "./world";

export interface Metrics {
  ticks: number;
  /** Durées de vie closes, dans l'ordre. */
  lifetimes: number[];
  ateFood: number;
  ateToxin: number;
  hits: number;
  deaths: number;
  energySum: number;
  rewardSum: number;
}

export interface Resume {
  ticks: number;
  /** NaN si aucune vie n'est close. */
  lifetimeMedian: number;
  lifetimeMean: number;
  energyMean: number;
  /** ateToxin / (ateFood + ateToxin). NaN si rien n'a été mangé. */
  toxinRatio: number;
  foodPerMilleTicks: number;
  rewardMean: number;
}

export function createMetrics(): Metrics {
  return {
    ticks: 0,
    lifetimes: [],
    ateFood: 0,
    ateToxin: 0,
    hits: 0,
    deaths: 0,
    energySum: 0,
    rewardSum: 0,
  };
}

export function recordTick(m: Metrics, energy: number, reward: number): void {
  m.ticks++;
  m.energySum += energy;
  m.rewardSum += reward;
}

export function recordEvent(m: Metrics, ev: WorldEventKind, lifeTicks: number): void {
  if (ev === "FOOD") m.ateFood++;
  else if (ev === "TOXIN") m.ateToxin++;
  else if (ev === "PREDATOR") m.hits++;
  else if (ev === "DEATH") {
    m.deaths++;
    m.lifetimes.push(lifeTicks);
  }
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const t = [...xs].sort((a, b) => a - b);
  const mid = t.length >> 1;
  return t.length % 2 === 1 ? t[mid] : (t[mid - 1] + t[mid]) / 2;
}

/**
 * Découpe le journal des vies en deux moitiés d'EXPÉRIENCE, c'est-à-dire au milieu du temps
 * cumulé — jamais au milieu du nombre de vies.
 *
 * La distinction n'est pas cosmétique : si l'organisme apprend, ses vies s'allongent, donc la
 * seconde moitié du temps contient MOINS de vies. Couper au milieu du compte mettrait des
 * vies tardives (longues) dans la première moitié et truquerait la comparaison en faveur de
 * la conclusion qu'on cherche justement à tester.
 */
export function splitHalves(lifetimes: number[]): { first: number[]; second: number[] } {
  if (lifetimes.length === 0) return { first: [], second: [] };
  const total = lifetimes.reduce((a, b) => a + b, 0);
  const moitie = total / 2;
  const first: number[] = [];
  const second: number[] = [];
  let cumul = 0;
  for (const v of lifetimes) {
    cumul += v;
    if (cumul <= moitie) first.push(v);
    else second.push(v);
  }
  return { first, second };
}

/**
 * Dérive des poids depuis un instantané de référence.
 *
 * `bougees` compte les arêtes dont le poids a changé ; `moyenne` est la dérive absolue moyenne
 * PAR ARÊTE, sur toutes les arêtes et non sur les seules arêtes qui ont bougé — c'est cette
 * seconde forme qui permet de comparer deux conditions sur la même topologie.
 *
 * Sert à distinguer les deux témoins que le lot 1 confondait : « gelé » au sens « pas
 * d'apprentissage » (l'homéostasie continue de mettre les poids à l'échelle) et « gelé » au sens
 * « aucun poids ne bouge ».
 */
export function derivePoids(
  topo: { e: number; w: Float32Array },
  reference: Float32Array,
): { moyenne: number; bougees: number } {
  if (reference.length !== topo.e) {
    throw new Error(`référence de taille ${reference.length}, attendu ${topo.e}`);
  }
  let somme = 0;
  let bougees = 0;
  for (let e = 0; e < topo.e; e++) {
    const d = Math.abs(topo.w[e] - reference[e]);
    if (d > 0) bougees++;
    somme += d;
  }
  return { moyenne: somme / topo.e, bougees };
}

export function summarize(m: Metrics): Resume {
  const mange = m.ateFood + m.ateToxin;
  return {
    ticks: m.ticks,
    lifetimeMedian: median(m.lifetimes),
    lifetimeMean:
      m.lifetimes.length > 0 ? m.lifetimes.reduce((a, b) => a + b, 0) / m.lifetimes.length : NaN,
    energyMean: m.ticks > 0 ? m.energySum / m.ticks : NaN,
    toxinRatio: mange > 0 ? m.ateToxin / mange : NaN,
    foodPerMilleTicks: m.ticks > 0 ? (m.ateFood * 1000) / m.ticks : NaN,
    rewardMean: m.ticks > 0 ? m.rewardSum / m.ticks : NaN,
  };
}
