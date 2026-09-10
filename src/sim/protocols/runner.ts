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
import { genererOdeur, type Odeur } from "../tasks/odors";
import { calendrier, type ConditionId } from "../tasks/schedules";
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
