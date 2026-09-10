// Les calendriers d'essais — les conditions expérimentales publiées du harnais.
//
//   apparié     : CS puis US à l'ISI, chevauchant la fin du CS — le conditionnement.
//   nonApparié  : CS seuls et US seuls en séquence pseudo-aléatoire — LE témoin qui
//                 distingue « le modèle apprend » de « le modèle reçoit du signal ».
//   inversé     : US AVANT CS — l'appariement arrière n'apprend rien (mesuré §5.2 :
//                 l'éligibilité n'existe pas encore quand le renforcement arrive).
//   gelé        : apparié avec lr = 0 — géré par le runner, pas ici.
//
// L'ITI est CALCULÉ depuis tauElig (spec §6.2 : ≥ 4·tauElig) — jamais écrit en dur :
// c'est la couture qu'un changement d'horloge a déjà cassée une fois.

import { mulberry32, type RNG } from "../../lib/rng";
import type { EssaiPlan } from "../task";
import type { Odeur } from "./odors";

export type ConditionId = "apparie" | "nonApparie" | "inverse" | "gele";

/** Durées de l'enveloppe, en ticks — les durées du protocole publié à dt = 1 ms. */
export interface Enveloppe {
  miseEnPlace: number;
  csDuree: number;
  /** Intervalle CS→US : 3 000 ticks = 3 s (optimum antérograde publié). */
  isi: number;
  usDuree: number;
  apres: number;
}

export const ENVELOPPE_DEFAUT: Enveloppe = {
  miseEnPlace: 2_000,
  csDuree: 4_000,
  isi: 3_000,
  usDuree: 3_000,
  apres: 2_000,
};

/** ITI minimal : 4 × tauElig + marge — l'éligibilité d'un essai doit être morte au suivant. */
export function itiTicks(tauElig: number, marge: number): number {
  return 4 * tauElig + marge;
}

/** Essai apparié : CS [miseEnPlace, +csDuree), US débute à csDebut + isi. */
export function essaiApparie(env: Enveloppe, odeur: Odeur, iti: number): EssaiPlan {
  const csDebut = env.miseEnPlace;
  const csFin = csDebut + env.csDuree;
  const usDebut = csDebut + env.isi;
  const usFin = usDebut + env.usDuree;
  const fin = Math.max(csFin, usFin) + env.apres;
  return {
    cs: { debut: csDebut, fin: csFin, odeur },
    us: { debut: usDebut, fin: usFin },
    // Noté pendant le CS, AVANT l'arrivée de l'US — la réponse conditionnée.
    notation: { debut: csDebut, fin: usDebut },
    duree: fin + iti,
  };
}

/** CS seul (un élément du témoin non apparié). */
export function essaiCsSeul(env: Enveloppe, odeur: Odeur, iti: number): EssaiPlan {
  const csDebut = env.miseEnPlace;
  const csFin = csDebut + env.csDuree;
  return {
    cs: { debut: csDebut, fin: csFin, odeur },
    us: null,
    notation: { debut: csDebut, fin: csDebut + env.isi },
    duree: csFin + env.apres + iti,
  };
}

/** US seul (l'autre élément du témoin non apparié) — plus court : pas de CS à attendre. */
export function essaiUsSeul(env: Enveloppe, iti: number): EssaiPlan {
  const usDebut = env.miseEnPlace;
  const usFin = usDebut + env.usDuree;
  return {
    cs: null,
    us: { debut: usDebut, fin: usFin },
    notation: null,
    duree: usFin + env.apres + iti,
  };
}

/** Appariement INVERSÉ : l'US précède le CS d'un ISI. Mesuré : rien ne s'apprend. */
export function essaiInverse(env: Enveloppe, odeur: Odeur, iti: number): EssaiPlan {
  const usDebut = env.miseEnPlace;
  const usFin = usDebut + env.usDuree;
  const csDebut = usFin + env.isi;
  const csFin = csDebut + env.csDuree;
  return {
    cs: { debut: csDebut, fin: csFin, odeur },
    us: { debut: usDebut, fin: usFin },
    notation: { debut: csDebut, fin: csDebut + env.isi },
    duree: csFin + env.apres + iti,
  };
}

/**
 * Le calendrier d'une condition pour UN sujet. Le non apparié alterne CS seuls et US
 * seuls dans un ordre pseudo-aléatoire propre au sujet (graine dérivée) — le témoin
 * publié exige que les deux stimuli ne co-occurent jamais.
 */
export function calendrier(
  cond: ConditionId,
  nEssais: number,
  odeur: Odeur,
  env: Enveloppe,
  iti: number,
  graineSujet: number,
): EssaiPlan[] {
  if (cond === "gele") cond = "apparie"; // même calendrier, lr = 0 — le runner gère.
  if (cond === "apparie") {
    return Array.from({ length: nEssais }, () => essaiApparie(env, odeur, iti));
  }
  if (cond === "inverse") {
    return Array.from({ length: nEssais }, () => essaiInverse(env, odeur, iti));
  }
  // Non apparié : nEssais CS seuls + nEssais US seuls, mélangés.
  const plans: EssaiPlan[] = [];
  for (let k = 0; k < nEssais; k++) plans.push(essaiCsSeul(env, odeur, iti));
  for (let k = 0; k < nEssais; k++) plans.push(essaiUsSeul(env, iti));
  const rng: RNG = mulberry32(graineSujet ^ 0x5f3759df);
  for (let k = plans.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    const tmp = plans[k];
    plans[k] = plans[j];
    plans[j] = tmp;
  }
  return plans;
}
