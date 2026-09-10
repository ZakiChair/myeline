// PORTE DU RANG 2 — le gradient de généralisation.
//
// Référence publiée (Guerrieri 2005) : après conditionnement appétitif sur une odeur,
// la réponse croisée à des odeurs à 1 / 2 / 3 carbones d'écart décroît 53 / 31 / 23 %.
//
// Porte : strictement décroissant sur les trois distances calibrées + ratio
// r(1C)/r(3C) ∈ [1,7 ; 2,9]. Contrôles : l'odeur conditionnée (distance 0) doit
// répondre ; le gelé ne doit répondre à rien.
//
// La carte « carbone → glomérules remplacés » est CALIBRÉE (CARBONE_REMPLACES dans
// runner.ts) : on mesure d'abord la fonction réponse↔distance de l'encodeur, puis on
// y place les distances publiées. Le contenu falsifiable de la porte est que la
// fonction est graduée et monotone — pas que nos « carbones » soient chimiques.
//
// CONFIGURATION : 32 sujets (banc ; publié 40), n = 2 500, durées physiologiques.

import { describe, expect, it } from "vitest";
import { LIF_DEFAUT, PLASTICITE_DEFAUT, VOIE_DEFAUT } from "./params";
import { CARBONE_REMPLACES, runGeneralisation } from "./protocols/runner";
import { PER_DEFAUT } from "./tasks/per";

const N_SUJETS = 32;
const N_ESSAIS = 5;

function lancer(lr: number, nSujets = N_SUJETS) {
  const distances = [0, CARBONE_REMPLACES[1], CARBONE_REMPLACES[2], CARBONE_REMPLACES[3], 32];
  return runGeneralisation({
    nSujets,
    nEssaisApprentissage: N_ESSAIS,
    distances,
    nPresentations: 1,
    voie: { ...VOIE_DEFAUT, n: 2_500 },
    lif: LIF_DEFAUT,
    plast: { ...PLASTICITE_DEFAUT, lr },
    per: PER_DEFAUT,
    nCal: 8,
    tauSp: 0.05,
    graineSujets: 0x2b9927,
    graineOdeurs: 0x51ab,
  });
}

describe("porte du rang 2 — gradient de généralisation", () => {
  it(
    "réponse décroissante sur les distances calibrées, ratio dans l'intervalle",
    () => {
      const r = lancer(0.05);
      const pts = r.points;
      console.log(`[RANG2] inclus=${r.sujetsInclus} exclus=${r.sujetsExclus}`);
      for (const pt of pts) {
        console.log(
          `[RANG2] distance ${pt.distance}/32 → ${((pt.repondants / pt.essais) * 100).toFixed(0)}% ` +
            `(${pt.repondants}/${pt.essais}) | compte moyen=${pt.compteMoyen.toFixed(0)}`,
        );
      }
      console.log(`[RANG2] ticks total = ${(r.ticksTotal / 1e6).toFixed(1)} M`);

      const rA = pts[0].repondants / pts[0].essais; // l'odeur conditionnée
      const r1 = pts[1].repondants / pts[1].essais;
      const r2 = pts[2].repondants / pts[2].essais;
      const r3 = pts[3].repondants / pts[3].essais;
      const rDisjoint = pts[4].repondants / pts[4].essais;

      // L'odeur conditionnée doit répondre.
      expect(rA).toBeGreaterThan(0.7);
      // Gradient strictement décroissant sur les distances calibrées.
      expect(r1).toBeGreaterThan(r2);
      expect(r2).toBeGreaterThan(r3);
      // Ratio dans l'intervalle publié.
      const ratio = r1 / r3;
      console.log(`[RANG2] ratio r(1C)/r(3C) = ${ratio.toFixed(2)} (bornes [1.7, 2.9])`);
      expect(ratio).toBeGreaterThan(1.7);
      expect(ratio).toBeLessThan(2.9);
      // Le disjoint reste sous le dernier point calibré.
      expect(rDisjoint).toBeLessThan(r3);
    },
    30 * 60_000,
  );

  it(
    "témoin gelé : sans plasticité, aucune distance ne répond",
    () => {
      // Moins de sujets : le témoin ne demande pas la puissance du gradient.
      const r = lancer(0, 12);
      for (const pt of r.points) {
        const taux = pt.repondants / pt.essais;
        console.log(`[RANG2 gelé] distance ${pt.distance} → ${(taux * 100).toFixed(0)}%`);
        expect(taux).toBeLessThan(0.15);
      }
    },
    30 * 60_000,
  );
});
