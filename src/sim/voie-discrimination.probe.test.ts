// PORTE DU RANG 4 — discrimination différentielle A+/B−.
//
// Référence publiée (Mota & Giurfa 2010, n = 111) : 5 essais CS+ appariés + 5 CS−
// jamais renforcés, entrelacés — interaction stimulus × essai F(4,436) = 76,21,
// p < 0,0001, avec ~31,5 % d'abeilles qui échouent la discrimination initiale.
//
// Porte :
//   1. McNemar exact sur les discordants du dernier essai (CS+ seul vs CS− seul)
//      < 0,01 — le test intra-sujet binaire apparié, plus fidèle aux données que
//      l'ANOVA publiée.
//   2. Contrebalancement : moitié A+/B−, moitié B+/A− — dans CHAQUE groupe les
//      discordants penchent vers le CS+. Sans ça, on mesure la préférence du
//      câblage, pas la contingence.
//   3. La porte tolère les non-discriminateurs (publié : ~31,5 %) — on exige un
//      effet de groupe, pas l'unanimité.
//   4. Gelé : sans plasticité, pas de différence CS+/CS−.
//
// Distance CS+/CS− = 30/32 remplacés : mesuré en sonde jetable — à 28 le CS−
// monte à ~80 % (généralisation trop forte), à 32 le test devient trivial. À 30
// le CS− suit la trajectoire publiée : monte par généralisation (~40 % à l'essai
// 4) puis reflue quand la discrimination s'affûte.
//
// CONFIGURATION : 32 sujets (banc ; publié 111), n = 2 500, durées physiologiques.

import { describe, expect, it } from "vitest";
import { LIF_DEFAUT, PLASTICITE_DEFAUT, VOIE_DEFAUT } from "./params";
import { runDiscrimination } from "./protocols/runner";
import { mcnemarExact } from "./protocols/stats";
import { PER_DEFAUT } from "./tasks/per";

const N_SUJETS = 32;
const N_PAIRES = 5;
const DISTANCE = 30;

function lancer(lr: number, nSujets = N_SUJETS) {
  return runDiscrimination({
    nSujets,
    nPaires: N_PAIRES,
    distance: DISTANCE,
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

describe("porte du rang 4 — discrimination A+/B−", () => {
  it(
    "le CS+ s'apprend, le CS− reste bas, et ça suit la contingence dans les deux groupes",
    () => {
      const r = lancer(0.05);
      const inc = r.sujets.filter((s) => !s.exclu);
      console.log(`[RANG4] inclus=${r.sujetsInclus} exclus=${r.sujetsExclus}`);
      for (let k = 0; k < N_PAIRES; k++) {
        const p = inc.filter((s) => s.reponsesPlus[k]).length;
        const m = inc.filter((s) => s.reponsesMoins[k]).length;
        console.log(
          `[RANG4] essai ${k + 1} : CS+ ${((p / inc.length) * 100).toFixed(0)}% | CS− ${((m / inc.length) * 100).toFixed(0)}%`,
        );
      }
      const dernier = N_PAIRES - 1;
      let b = 0, c = 0;
      for (const s of inc) {
        if (s.reponsesPlus[dernier] && !s.reponsesMoins[dernier]) b++;
        if (!s.reponsesPlus[dernier] && s.reponsesMoins[dernier]) c++;
      }
      const pMc = mcnemarExact(b, c);
      console.log(`[RANG4] dernier essai : discordants CS+seul=${b} CS−seul=${c} → McNemar p=${pMc.toExponential(2)}`);
      expect(pMc).toBeLessThan(0.01);

      // Contrebalancement : le sens de la discrimination suit la contingence dans
      // les deux groupes — jamais vers le CS−.
      for (const g of [0, 1] as const) {
        const gs = inc.filter((s) => s.groupe === g);
        let bg = 0, cg = 0;
        for (const s of gs) {
          if (s.reponsesPlus[dernier] && !s.reponsesMoins[dernier]) bg++;
          if (!s.reponsesPlus[dernier] && s.reponsesMoins[dernier]) cg++;
        }
        console.log(`[RANG4] groupe ${g} (CS+=${g === 0 ? "A" : "B"}) : +seul=${bg} −seul=${cg}`);
        expect(bg).toBeGreaterThan(cg);
      }
      console.log(`[RANG4] ticks total = ${(r.ticksTotal / 1e6).toFixed(1)} M`);
    },
    30 * 60_000,
  );

  it(
    "témoin gelé : sans plasticité, aucune différence CS+/CS−",
    () => {
      const r = lancer(0, 12);
      const inc = r.sujets.filter((s) => !s.exclu);
      const dernier = N_PAIRES - 1;
      const p = inc.filter((s) => s.reponsesPlus[dernier]).length;
      const m = inc.filter((s) => s.reponsesMoins[dernier]).length;
      console.log(`[RANG4 gelé] dernier essai : CS+ ${p}/${inc.length} | CS− ${m}/${inc.length}`);
      // Ni l'un ni l'autre ne doit décoller du niveau naïf.
      expect(p).toBeLessThanOrEqual(Math.ceil(inc.length * 0.15));
      expect(m).toBeLessThanOrEqual(Math.ceil(inc.length * 0.15));
    },
    30 * 60_000,
  );
});
