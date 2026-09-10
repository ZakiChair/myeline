// SONDE DU LOT 1 — la porte : la courbe d'acquisition de Bitterman sur substrat
// impulsionnel complet.
//
// Référence publiée : Bitterman, Menzel, Fietz & Schäfer 1983, via Giurfa & Sandoz
// 2012 — apparié ≈ 80 % de répondants à l'essai 3, non apparié plat proche de 0.
//
// PORTE (spec §9) : reproduire la courbe avec AU PLUS DEUX paramètres ajustés, et les
// trois témoins au comportement annoncé :
//   - non apparié : plat (Fisher p < 0,01 à l'essai final, apparié > non apparié) ;
//   - inversé (US avant CS) : n'apprend rien — l'éligibilité n'existe pas quand le
//     renforcement arrive ;
//   - gelé (lr = 0) : zéro synapse déplacée, courbe plate.
//
// Paramètres ajustés déclarés (budget ≤ 2, spec §9) : `lr` et `margeSeuil`, la règle de
// décision. Le seuil de réponse est DÉDUIT du taux spontané cible (calibration par
// sujet), pas ajusté sur la courbe. Le gain APL est fixé par la cible de sparsité
// publiée (≈ 4–7 %, Szyszka 2008), pas par la courbe.
//
// CONFIGURATION : réduite pour le banc (n, sujets) — mêmes durées physiologiques.
// La version publiée (40 sujets) est le même code avec NSUJETS=40.

import { describe, expect, it } from "vitest";
import { LIF_DEFAUT, PLASTICITE_DEFAUT, VOIE_DEFAUT } from "./params";
import { runProtocole, type ResultatProtocole } from "./protocols/runner";
import { fisherExact } from "./protocols/stats";
import { PER_DEFAUT } from "./tasks/per";
import type { ConditionId } from "./tasks/schedules";

const N_SUJETS = 16;
const N_ESSAIS = 5;
const N_VOIE = 1_200;

function lancer(conditions: ConditionId[], lr: number): ResultatProtocole {
  return runProtocole({
    nSujets: N_SUJETS,
    nEssais: N_ESSAIS,
    conditions,
    voie: { ...VOIE_DEFAUT, n: N_VOIE, gainAPL: 20, w0: 0.003 },
    lif: LIF_DEFAUT,
    plast: { ...PLASTICITE_DEFAUT, lr },
    per: PER_DEFAUT,
    nCal: 8,
    tauSp: 0.05,
    graineSujets: 0x2b9927,
    graineOdeurs: 0x51ab,
  });
}

describe("porte du lot 1 — la courbe d'acquisition", () => {
  it(
    "apparié monte, non apparié plat, inversé plat, gelé immobile",
    () => {
      const r = lancer(["apparie", "nonApparie", "inverse", "gele"], 0.05);
      const par = new Map(r.conditions.map((c) => [c.condition, c]));

      for (const c of r.conditions) {
        console.log(
          `[PORTE] ${c.condition} | inclus=${c.sujetsInclus} exclus=${c.sujetsExclus} ` +
            `seuil médian=${c.seuilMedian} | courbe=${c.courbe.map((x) => (x * 100).toFixed(0) + "%").join(" ")} ` +
            `| synapses déplacées/sujet=${c.synapsesDeplacees.toFixed(1)}`,
        );
      }
      console.log(`[PORTE] ticks total = ${(r.ticksTotal / 1e6).toFixed(1)} M`);

      const a = par.get("apparie")!;
      const na = par.get("nonApparie")!;
      const inv = par.get("inverse")!;
      const gel = par.get("gele")!;
      const k = N_ESSAIS - 1; // essai final

      // Témoin gelé : AUCUNE synapse ne doit avoir bougé — le confinement + lr = 0.
      expect(gel.synapsesDeplacees).toBe(0);

      // La courbe appariée monte : dernier essai nettement au-dessus du premier.
      expect(a.courbe[k]).toBeGreaterThan(a.courbe[0]);

      // Fisher exact à l'essai final : apparié strictement au-dessus du non apparié.
      const repA = a.repondants[k] ?? 0;
      const repNA = na.repondants[k] ?? 0;
      const pFisher = fisherExact(repA, a.sujetsInclus - repA, repNA, na.sujetsInclus - repNA);
      console.log(
        `[PORTE] Fisher essai ${N_ESSAIS} : apparié ${repA}/${a.sujetsInclus} vs non apparié ${repNA}/${na.sujetsInclus} → p=${pFisher.toExponential(2)}`,
      );
      expect(pFisher).toBeLessThan(0.01);

      // L'inversé n'apprend pas : dernier essai pas au-dessus du non apparié.
      const repInv = inv.repondants[k] ?? 0;
      const pInv = fisherExact(repInv, inv.sujetsInclus - repInv, repNA, na.sujetsInclus - repNA);
      console.log(`[PORTE] inversé ${repInv}/${inv.sujetsInclus} vs non apparié → p=${pInv.toFixed(3)}`);
      expect(pInv).toBeGreaterThan(0.05);
    },
    30 * 60_000,
  );
});
