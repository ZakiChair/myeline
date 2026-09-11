// Le contrat des harnais expérimentaux — spec §7. Une tâche remplace le « monde » :
// elle décide des frontières d'essai, pose les stimuli à des instants connus au tick
// près, et note la réponse. L'arène reste intacte par ailleurs ; ici, le harnachement
// supprime la locomotion, ce qui rend l'attribution du crédit triviale — c'est la raison
// d'être du lot 1.

import type { Odeur } from "./tasks/odors";

/** Une fenêtre [debut, fin) en ticks relatifs à l'essai. */
export interface Fenetre {
  debut: number;
  fin: number;
}

/**
 * Le plan d'un essai : ce que le harnais présente, et où il note.
 *
 * `notation` est la fenêtre de comptage des décharges de sortie — pendant le CS et
 * AVANT l'arrivée de l'US : une réponse qui précède le renforcement est une réponse
 * conditionnée, pas le réflexe. null sur les essais sans CS (rien à noter).
 */
/** Le canal du renforcement : « oa » = voie appétitive (sucrose), « da » = aversive
 *  (choc). Chez l'insecte, le renforcement appétitif est octopaminergique et
 *  l'aversif dopaminergique — deux voies lésables séparément (rang 3). */
export type CanalRenforcement = "oa" | "da";

export interface EssaiPlan {
  /** Stimulus conditionné : odeur présentée sur [debut, fin). */
  cs: (Fenetre & { odeur: Odeur }) | null;
  /** Stimulus inconditionné sur [debut, fin) — le canal choisit l'injection et le
   *  neuromodulateur déversé. */
  us: (Fenetre & { canal: CanalRenforcement }) | null;
  /** Fenêtre de comptage, et quelle sortie elle lit : « mbon » = réponse appétitive,
   *  « ser » = réponse défensive. */
  notation: (Fenetre & { sortie: "mbon" | "ser" }) | null;
  /** Durée totale de l'enveloppe, ITI compris. */
  duree: number;
}

/** Résultat d'un essai noté. */
export interface ResultatEssai {
  /** Décharges de sortie comptées dans la fenêtre de notation. */
  compte: number;
  /** La décision binaire : compte > seuil (+ bruit de décision éventuel). */
  reponse: boolean;
}

/** Journal d'un sujet : une entrée par essai noté. */
export interface JournalSujet {
  sujet: number;
  condition: string;
  seuil: number;
  exclu: boolean;
  essais: ResultatEssai[];
}
