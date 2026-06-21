// Constantes de règles et paramètres par défaut PARTAGÉS entre les deux moteurs
// (simulation.ts à base de Map pour le mode Studio, scale-engine.ts à base de
// typed-arrays pour le mode Échelle). Source de vérité unique → pas de dérive.

import type { SimParams } from "./types";

// Vitalité : intégrateur d'activité récente.
export const VIT_GAIN = 8; // gain par décharge
export const VIT_MAX = 20;
export const VIT_BIRTH = 8; // vitalité requise pour enfanter
export const VIT_SYNAPTO = 6; // vitalité requise pour la synaptogenèse

// Poids synaptiques (plasticité hebbienne).
export const W_INIT = 5;
export const W_UP = 2.5; // renforcement des paires co-excitées
export const W_DOWN = 0.12; // décroissance lente sinon
export const W_MAX = 14;
export const W_PRUNE = 0.5; // en dessous, la synapse est élaguée

// STDP (plasticité directionnelle opt-in) : pré→post renforce (LTP), ordre inverse affaiblit (LTD).
export const STDP_LTP = 2.5;
export const STDP_LTD = 2.5;

/**
 * Décharge pondérée : un neurone au repos décharge si la FRACTION PONDÉRÉE de ses
 * voisins excités (poids des voisins excités / poids de tous les voisins) atteint φ.
 * Normalisé par le poids total ⇒ poids uniformes ⇒ équivaut à la fraction brute
 * `excités / degré` (les poids deviennent causaux sans changer le régime à poids égaux).
 */
export function firesByThreshold(
  excitedWeight: number,
  totalWeight: number,
  phi: number,
): boolean {
  return totalWeight > 0 && excitedWeight / totalWeight >= phi;
}

/**
 * Loi de Dale : assigne un neurone comme inhibiteur de façon DÉTERMINISTE (par stride,
 * zéro RNG → ne décale pas la séquence mulberry32, préserve la calibration σ et les tests).
 * inhibRatio=0 ⇒ aucun inhibiteur (tout excitateur = comportement historique).
 */
export function isInhibitory(index: number, inhibRatio: number): boolean {
  if (inhibRatio <= 0) return false;
  const stride = Math.max(2, Math.round(1 / inhibRatio));
  return index % stride === stride - 1;
}

export const DEFAULT_PARAMS: SimParams = {
  initialCount: 40,
  activeRatio: 0.18,
  minInitialLinks: 1,
  maxInitialLinks: 9,
  fireFraction: 0.16,
  refractory: 2,
  spontaneous: 0.02,
  developEvery: 5,
  populationCap: 1500,
  surviveThreshold: 2,
  birthThreshold: 6,
  hebbian: true,
  synaptogenesis: 0.02,
  maxDegree: 16,
  inhibRatio: 0, // loi de Dale : fraction de neurones inhibiteurs (0 = tout excitateur)
};
