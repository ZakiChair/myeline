// Le harnais : conditionnement du réflexe d'extension. Aucune locomotion — la position,
// l'énergie, la mort et la chaîne multi-décisions disparaissent ; le CS et l'US sont
// posés à des instants connus au tick près (spec §6.2). C'est ce qui rend l'attribution
// du crédit triviale et la porte falsifiable.
//
// La réponse est BINAIRE par essai : décharges du neurone de sortie dans la fenêtre de
// notation (le CS avant l'arrivée de l'US) contre un seuil calibré par sujet. Le taux de
// réponse spontanée n'a pas été retrouvé dans les sources (spec §10) : le seuil est
// déduit d'un taux cible déclaré, et la porte porte sur le CONTRASTE entre groupes,
// jamais sur un niveau absolu.

import type { RNG } from "../../lib/rng";
import { gaussTable } from "../bruit";
import type { PlasticityParams } from "../params";
import type { EssaiPlan, ResultatEssai } from "../task";
import {
  dechargesSortie,
  injecterGust,
  injecterOdeur,
  stepVoie,
  type Voie,
} from "../voie";
import type { Odeur } from "./odors";
import { essaiCsSeul, essaiUsSeul, itiTicks, type Enveloppe } from "./schedules";

export interface PerParams {
  env: Enveloppe;
  /** Gain d'injection de l'odeur dans les glomérules. */
  injectOdeur: number;
  /** Gain d'injection du sucrose dans la voie gustative. */
  injectGust: number;
  /** Dopamine émise par tick PENDANT l'US. */
  daUS: number;
  /** Marge ajoutée à 4·tauElig pour l'ITI. */
  margeITI: number;
  /**
   * Dépassement relatif exigé du niveau naïf pour compter une réponse :
   * seuil = quantile naïf × margeSeuil. La sensibilisation non appariée existe ici
   * (mesurée : ≤ +20 % du niveau naïf sur le protocole) comme chez l'animal — une
   * réponse conditionnée doit en être NETTEMENT au-dessus. Paramètre ajusté déclaré.
   */
  margeSeuil: number;
  /**
   * Amplitude du bruit de décision : ajouté au compte avant comparaison au seuil.
   * 0 = lecture déterministe du compte.
   */
  bruitDecision: number;
}

export const PER_DEFAUT: PerParams = {
  env: { miseEnPlace: 2_000, csDuree: 4_000, isi: 3_000, usDuree: 3_000, apres: 2_000 },
  injectOdeur: 1.2,
  injectGust: 1.5,
  daUS: 0.02,
  margeITI: 2_000,
  margeSeuil: 1.4,
  bruitDecision: 0,
};

/** Un essai complet : stimuli aux instants du plan, dopamine pendant l'US, notation. */
export function runEssai(
  v: Voie,
  plan: EssaiPlan,
  p: PerParams,
  seuil: number,
  rng: RNG,
): ResultatEssai {
  let compte = 0;
  const not = plan.notation;
  for (let t = 0; t < plan.duree; t++) {
    if (plan.cs !== null && t >= plan.cs.debut && t < plan.cs.fin) {
      injecterOdeur(v, plan.cs.odeur.intensites, p.injectOdeur);
    }
    const usActif = plan.us !== null && t >= plan.us.debut && t < plan.us.fin;
    if (usActif) injecterGust(v, p.injectGust);
    stepVoie(v, rng, usActif ? p.daUS : 0);
    if (not !== null && t >= not.debut && t < not.fin) compte += dechargesSortie(v);
  }
  const score = p.bruitDecision > 0 ? compte + p.bruitDecision * gaussTable(rng) : compte;
  return { compte, reponse: score > seuil };
}

/**
 * Calibre le seuil de réponse DU sujet sur ses propres présentations naïves du CS :
 * `nCal` essais CS-seul, puis seuil = quantile empirique (1 − tauSp) des comptages + 1,
 * pour que le taux de réponse spontanée vaille au plus ≈ tauSp. Déduit, pas ajusté —
 * le taux spontané cible est une donnée du protocole, pas un paramètre libre.
 */
export function calibrerSeuil(
  v: Voie,
  odeur: Odeur,
  p: PerParams,
  plast: PlasticityParams,
  nCal: number,
  tauSp: number,
  rng: RNG,
): { seuil: number; comptages: Int32Array } {
  const iti = itiTicks(plast.tauElig, p.margeITI);
  const comptages = new Int32Array(nCal);
  for (let k = 0; k < nCal; k++) {
    comptages[k] = runEssai(v, essaiCsSeul(p.env, odeur, iti), p, 0, rng).compte;
  }
  const tri = Int32Array.from(comptages).sort();
  const idx = Math.min(nCal - 1, Math.floor((1 - tauSp) * nCal));
  // Quantile naïf +1 (lecture stricte : « au-dessus du niveau naïf »), puis la marge
  // relative — sans elle la sensibilisation non appariée (réelle, mesurée) franchit
  // un seuil posé à la limite de la distribution naïve.
  return { seuil: Math.ceil((tri[idx] + 1) * p.margeSeuil), comptages };
}

/**
 * Le réflexe inconditionnel : un US seul doit faire répondre — câblage gustatif →
 * sortie, inné. Le protocole publié EXCLUT tout sujet qui ne le montre pas ; on fait
 * pareil. La fenêtre est celle de l'US (la réponse inconditionnée n'a pas à anticiper).
 */
export function reflexeInconditionnel(
  v: Voie,
  p: PerParams,
  plast: PlasticityParams,
  seuil: number,
  rng: RNG,
): boolean {
  const iti = itiTicks(plast.tauElig, p.margeITI);
  const plan = essaiUsSeul(p.env, iti);
  const fenetre = { debut: plan.us!.debut, fin: plan.us!.fin };
  let compte = 0;
  for (let t = 0; t < plan.duree; t++) {
    if (t >= plan.us!.debut && t < plan.us!.fin) injecterGust(v, p.injectGust);
    stepVoie(v, rng, 0); // l'US de CONTRÔLE ne renforce pas : il vérifie le câblage.
    if (t >= fenetre.debut && t < fenetre.fin) compte += dechargesSortie(v);
  }
  return compte > seuil;
}
