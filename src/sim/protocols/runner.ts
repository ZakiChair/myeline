// Le runner du protocole : sujets × conditions × essais, avec journal.
//
// PLAN INTRA-SUJET (spec §6.3, rang 1) : le noyau est reproductible, donc le MÊME
// cerveau — même graine, même câblage, mêmes poids initiaux — passe dans chaque
// condition. Impossible sur un animal réel ; c'est l'avantage du banc.
//
// Contrôle de bon fonctionnement intégré (protocole publié) : le réflexe
// inconditionnel gustatif → sortie est vérifié sur chaque sujet ; qui ne le montre
// pas est exclu — dans TOUTES les conditions, puisque c'est le même cerveau.

import { mulberry32 } from "../../lib/rng";
import type { LifParams, PlasticityParams, VoieParams } from "../params";
import type { JournalSujet, ResultatEssai } from "../task";
import { calibrerSeuil, reflexeInconditionnel, runEssai, type PerParams } from "../tasks/per";
import { declinerN, genererOdeur, type Odeur } from "../tasks/odors";
import { calendrier, essaiCsSeul, itiTicks, ENVELOPPE_DEFAUT, type ConditionId } from "../tasks/schedules";
import { createVoie, type Voie } from "../voie";

export interface RunnerParams {
  /** Sujets par condition. Le protocole publié exige 40 ; le banc peut réduire — déclaré. */
  nSujets: number;
  /** Essais notés par sujet. Publié : 5. */
  nEssais: number;
  conditions: ConditionId[];
  voie: VoieParams;
  lif: LifParams;
  plast: PlasticityParams;
  per: PerParams;
  /** Présentations CS-seul pour calibrer le seuil de chaque sujet. */
  nCal: number;
  /** Taux de réponse spontanée cible — repère déclaré (non retrouvé dans les sources). */
  tauSp: number;
  /** Graine de base du câblage ; le sujet s utilise `seed ^ s`. */
  graineSujets: number;
  /** Graine du tirage des odeurs (chaque sujet a la sienne). */
  graineOdeurs: number;
}

export interface ResultatCondition {
  condition: ConditionId;
  /** % de répondants à chaque essai noté, sur les sujets inclus. */
  courbe: number[];
  /** Répondants par essai (numérateurs de la courbe). */
  repondants: number[];
  sujetsInclus: number;
  sujetsExclus: number;
  seuilMedian: number;
  /** Arêtes plastiques déplacées en moyenne par sujet inclus (mesure du mouvement). */
  synapsesDeplacees: number;
}

export interface ResultatProtocole {
  conditions: ResultatCondition[];
  journaux: JournalSujet[];
  /** t (ticks) total simulé — le coût déclaré du protocole. */
  ticksTotal: number;
}

function mediane(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const t = [...xs].sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 === 1 ? t[m] : (t[m - 1] + t[m]) / 2;
}

/** Sel par condition : des flots de bruit distincts, déterministes. */
function sel(cond: ConditionId): number {
  switch (cond) {
    case "apparie":
      return 0xa53a9d3b;
    case "nonApparie":
      return 0x1b873593;
    case "inverse":
      return 0x9e4d2b71;
    case "gele":
      return 0x3d1c0f55;
  }
}

export function runProtocole(p: RunnerParams): ResultatProtocole {
  const journaux: JournalSujet[] = [];
  const parCond = new Map<ConditionId, { repondants: number[]; seuils: number[]; deplacees: number[]; inclus: number; exclus: number }>();
  for (const c of p.conditions) {
    parCond.set(c, {
      repondants: new Array(p.nEssais).fill(0),
      seuils: [],
      deplacees: [],
      inclus: 0,
      exclus: 0,
    });
  }
  let ticksTotal = 0;

  for (let s = 0; s < p.nSujets; s++) {
    const graineSujet = p.graineSujets ^ s;
    const odeur: Odeur = genererOdeur(
      mulberry32(p.graineOdeurs ^ s),
      p.voie.nGlom,
      "A",
    );

    for (const cond of p.conditions) {
      const acc = parCond.get(cond)!;
      const lr = cond === "gele" ? 0 : p.plast.lr;
      const sujet: Voie = createVoie(
        { ...p.voie, seed: graineSujet },
        p.lif,
        { ...p.plast, lr },
      );
      const rng = mulberry32(graineSujet ^ sel(cond));

      // Calibration du seuil sur les réponses naïves au CS, puis contrôle UR.
      const { seuil } = calibrerSeuil(sujet, odeur, p.per, p.plast, p.nCal, p.tauSp, rng);
      if (!reflexeInconditionnel(sujet, p.per, p.plast, seuil, rng)) {
        acc.exclus++;
        journaux.push({ sujet: s, condition: cond, seuil, exclu: true, essais: [] });
        continue;
      }
      acc.inclus++;
      acc.seuils.push(seuil);

      const w0 = sujet.topo.w.slice();
      const plans = calendrier(cond, p.nEssais, odeur, p.per.env, 4 * p.plast.tauElig + p.per.margeITI, graineSujet);
      const essais: ResultatEssai[] = [];
      for (const plan of plans) {
        ticksTotal += plan.duree;
        if (plan.notation === null) {
          // Essai non noté (US seul) : on le joue, on ne le consigne pas dans la courbe.
          runEssai(sujet, plan, p.per, seuil, rng);
          continue;
        }
        essais.push(runEssai(sujet, plan, p.per, seuil, rng));
      }
      for (let k = 0; k < essais.length; k++) {
        if (essais[k].reponse) acc.repondants[k]++;
      }
      let deplacees = 0;
      for (const e of sujet.plastSet) if (sujet.topo.w[e] !== w0[e]) deplacees++;
      acc.deplacees.push(deplacees);
      journaux.push({ sujet: s, condition: cond, seuil, exclu: false, essais });
    }
  }

  const conditions: ResultatCondition[] = [];
  for (const [condition, acc] of parCond) {
    conditions.push({
      condition,
      courbe: acc.repondants.map((r) => (acc.inclus > 0 ? r / acc.inclus : 0)),
      repondants: acc.repondants,
      sujetsInclus: acc.inclus,
      sujetsExclus: acc.exclus,
      seuilMedian: mediane(acc.seuils),
      synapsesDeplacees:
        acc.deplacees.length > 0
          ? acc.deplacees.reduce((a, b) => a + b, 0) / acc.deplacees.length
          : 0,
    });
  }
  return { conditions, journaux, ticksTotal };
}

// ---------------------------------------------------------------------------
// Rang 2 — généralisation : après conditionnement sur A, mesurer la réponse à des
// odeurs déclinées à distance croissante dans l'encodeur.
//
// CALIBRATION MESURÉE (24 sujets, régime épars, 2026-07-31) : la réponse croisée
// décroît monotone de ~92 % (26/32 remplacés) à ~17 % (32/32, disjoint). Les trois
// distances « carbone » de la référence sont associées aux distances de l'encodeur
// qui tombent sur le gradient — c'est ça, calibrer un encodeur.
//   1C → 28 remplacés (~67 % mesuré)   2C → 30 (~50 %)   3C → 31 (~25 %)
// Écart assumé vs publié (53/31/23) : notre réponse conditionnée sature vers 100 %
// là où la référence plafonne ~80 % — le gradient entier est décalé vers le haut.
/** Distance de l'encodeur (glomérules remplacés) associée à l'écart « carbone ». */
export const CARBONE_REMPLACES: Record<number, number> = { 1: 28, 2: 30, 3: 31 };

export interface GeneralisationParams {
  nSujets: number;
  /** Essais appariés sur l'odeur de base avant les tests. Publié : 5. */
  nEssaisApprentissage: number;
  /** Distances testées (comptes entiers de glomérules remplacés). */
  distances: number[];
  /** Présentations par distance et par sujet. */
  nPresentations: number;
  voie: VoieParams;
  lif: LifParams;
  plast: PlasticityParams;
  per: PerParams;
  nCal: number;
  tauSp: number;
  graineSujets: number;
  graineOdeurs: number;
}

export interface PointGeneralisation {
  distance: number;
  repondants: number;
  essais: number;
  compteMoyen: number;
}

export interface ResultatGeneralisation {
  points: PointGeneralisation[];
  sujetsInclus: number;
  sujetsExclus: number;
  ticksTotal: number;
}

/**
 * Protocole de généralisation : chaque sujet est calibré, vérifié au contrôle UR,
 * conditionné sur A (apparié), puis testé sur les déclinaisons — ORDRE DES TESTS
 * ALÉATOIRE PAR SUJET (protocole publié : les essais de généralisation ne sont pas
 * triés par distance).
 */
export function runGeneralisation(p: GeneralisationParams): ResultatGeneralisation {
  const points = p.distances.map((distance) => ({
    distance,
    repondants: 0,
    essais: 0,
    compteMoyen: 0,
  }));
  const iti = itiTicks(p.plast.tauElig, p.per.margeITI);
  let inclus = 0;
  let exclus = 0;
  let ticksTotal = 0;

  for (let s = 0; s < p.nSujets; s++) {
    const graineSujet = p.graineSujets ^ s;
    const sujet: Voie = createVoie({ ...p.voie, seed: graineSujet }, p.lif, p.plast);
    const rng = mulberry32(graineSujet ^ 0x67756d61);
    const A = genererOdeur(mulberry32(p.graineOdeurs ^ s), p.voie.nGlom, "A");

    const { seuil } = calibrerSeuil(sujet, A, p.per, p.plast, p.nCal, p.tauSp, rng);
    if (!reflexeInconditionnel(sujet, p.per, p.plast, seuil, rng)) {
      exclus++;
      continue;
    }
    inclus++;

    // Conditionnement : nEssaisApprentissage essais appariés sur A.
    for (let k = 0; k < p.nEssaisApprentissage; k++) {
      const plan = calendrier("apparie", 1, A, ENVELOPPE_DEFAUT, iti, graineSujet)[0];
      ticksTotal += plan.duree;
      runEssai(sujet, plan, p.per, seuil, rng);
    }

    // Tests : ordre des distances tiré par sujet.
    const ordre = Int32Array.from({ length: p.distances.length }, (_, k) => k);
    const rngOrdre = mulberry32(graineSujet ^ 0x9e3779b9);
    for (let k = ordre.length - 1; k > 0; k--) {
      const j = Math.floor(rngOrdre() * (k + 1));
      const tmp = ordre[k];
      ordre[k] = ordre[j];
      ordre[j] = tmp;
    }
    for (const k of ordre) {
      for (let rep = 0; rep < p.nPresentations; rep++) {
        const B = declinerN(
          mulberry32(graineSujet ^ 0xdec1 ^ (k * 31 + rep)),
          A,
          p.distances[k],
          `B${k}`,
        );
        const plan = essaiCsSeul(ENVELOPPE_DEFAUT, B, iti);
        ticksTotal += plan.duree;
        const r = runEssai(sujet, plan, p.per, seuil, rng);
        const pt = points[k];
        pt.essais++;
        pt.compteMoyen += r.compte;
        if (r.reponse) pt.repondants++;
      }
    }
  }
  for (const pt of points) {
    if (pt.essais > 0) pt.compteMoyen /= pt.essais;
  }
  return { points, sujetsInclus: inclus, sujetsExclus: exclus, ticksTotal };
}
