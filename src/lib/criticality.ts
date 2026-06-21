// Sondes de criticité pour le moteur Échelle. PUR.
//
// σ (ratio de branchement) = combien de décharges chaque décharge en engendre en moyenne.
//   σ < 1 → l'activité s'éteint (sous-critique) ; σ > 1 → elle explose (sur-critique) ;
//   σ ≈ 1 → criticité, le régime « avalanches » où l'information se propage le plus loin.
//
// ⚠️ Estimateur ILLUSTRATIF : moyenne des ratios excited(t+1)/excited(t). Biaisé sous
// sous-échantillonnage (ratio-de-moyennes). Pour une revendication défendable, utiliser
// un estimateur robuste (exposants en loi de puissance des avalanches, ou MR de
// Wilting–Priesemann). Suffisant pour les gates de décision (σ traverse-t-il 1 ?).

/** σ illustratif depuis une série de comptes d'excités par tick. */
export function estimateBranching(excited: number[]): number {
  let sum = 0;
  let n = 0;
  for (let t = 0; t + 1 < excited.length; t++) {
    if (excited[t] > 0) {
      sum += excited[t + 1] / excited[t];
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}
