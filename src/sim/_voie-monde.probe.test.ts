// SONDE DE PORTE — rang 5 : la voie olfactive réinjectée dans l'organisme libre.
//
// L'organisme partage son monde avec deux sources d'odeur : nourriture (renforce
// l'approche, canal OA → MBON) et toxine (renforce l'évitement, canal DA → SER).
// Le prédateur reste sur le canal ALARM — il ne renforce PAS la voie (mesuré :
// sinon la nourriture se consolidait en aversif).
//
// L'attribution causale est le cœur du mécanisme : dans l'arène dense, les deux
// odeurs partagent la dominance au contact (~50/50 — mesuré) ; le temps seul ne
// sépare pas l'odeur causale. Chaque écriture d'éligibilité est donc étiquetée
// par l'odeur injectée (eligOdeur), remise à zéro au changement d'odeur, et un
// événement ne consolide que les marques portant SON odeur. La marque est la
// trace de stimulus (eligTrace) — la sortie naïve tire trop rarement pour écrire
// par coïncidence. Portes : fraisMin (écriture — source vraiment active) et
// seuilElig (consolidation — marque forte).
//
// Porte : sélectivité des poids (w(SER) toxine ≫ nourriture, w(MBON) nourriture
// ≫ toxine), réponses sondées sélectives, dissociation des lésions (OA tue
// l'appétitif seul, DA l'aversif seul), gelé plat, toxine réduite, reproductible.
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../lib/rng";
import { createOrganism, runOrganism, type Organism } from "./organism";
import {
  LIF_DEFAUT,
  ORGANISME_DEFAUT,
  PLASTICITE_DEFAUT,
  VOIE_DEFAUT,
  type OrganismParams,
} from "./params";
import { dechargesSer, dechargesSortie, injecterOdeur, stepVoie } from "./voie";

const TICKS = 300_000;
/** Répondeur : décharge répétée sous l'odeur — le tir spontané n'atteint pas ce seuil. */
const MIN_DECHARGES_REPONDEUR = 30;

function paramsAvecVoie(seed: number, lr: number): OrganismParams {
  return {
    ...ORGANISME_DEFAUT,
    worldSeed: 1000 + seed,
    brain: {
      ...ORGANISME_DEFAUT.brain,
      topology: { ...ORGANISME_DEFAUT.brain.topology, n: 2500, seed },
    },
    voie: {
      actif: true,
      voie: { ...VOIE_DEFAUT, n: 2500, seed: 0x5eed ^ seed },
      lif: LIF_DEFAUT,
      plast: {
        ...PLASTICITE_DEFAUT,
        lr,
        tauElig: 500,
        eligTrace: true,
        seuilElig: 0.2,
        fraisMin: 0.3,
      },
      gainApproche: 0.2,
      gainDir: 0.3,
      gainEvite: 0.35,
      oaDose: 4,
      daDose: 4,
      injectOdeur: 1.5,
    },
  };
}

interface Sondage {
  m: number;
  s: number;
  kcVus: Set<number>;
}

interface PoidsGroupes {
  f: number;
  t: number;
  autre: number;
}

interface Mesure {
  ateFood: number;
  ateToxin: number;
  vies: number;
  reponse: { food: Sondage; toxin: Sondage; poidsSer: PoidsGroupes; poidsMbon: PoidsGroupes };
}

/** Réponse de la voie à une odeur présentée seule, hors monde : compte sur 2000 t,
 *  plus les KC ayant déchargé sous cette odeur — pour grouper les poids par
 *  appartenance. */
function sonderVoie(org: Organism, rng: ReturnType<typeof mulberry32>) {
  const v = org.voie!;
  const sondage = (odeur: typeof org.odeurFood): Sondage => {
    for (let t = 0; t < 500; t++) stepVoie(v, rng, 0, 0); // laisser décroître les traces
    let m = 0;
    let s = 0;
    const kcComptes = new Map<number, number>();
    for (let t = 0; t < 2000; t++) {
      injecterOdeur(v, odeur!.intensites, org.params.voie!.injectOdeur);
      stepVoie(v, rng, 0, 0);
      m += dechargesSortie(v);
      s += dechargesSer(v);
      for (let k = 0; k < v.lif.spikeCount; k++) {
        const i = v.lif.spikes[k];
        if (i >= v.bornes.kc.start && i < v.bornes.kc.start + v.bornes.kc.count) {
          kcComptes.set(i, (kcComptes.get(i) ?? 0) + 1);
        }
      }
    }
    const kcVus = new Set<number>();
    for (const [i, c] of kcComptes) if (c >= MIN_DECHARGES_REPONDEUR) kcVus.add(i);
    return { m, s, kcVus };
  };
  const food = sondage(org.odeurFood);
  const toxin = sondage(org.odeurToxin);
  // Poids des arêtes KC → SER et KC → MBON, groupés par l'odeur qui fait décharger
  // la KC source : mesure directe de la sélectivité de la consolidation.
  const topo = v.topo;
  const ser0 = v.bornes.ser.start;
  const ser1 = ser0 + v.bornes.ser.count;
  const mb0 = v.bornes.mbon.start;
  const mb1 = mb0 + v.bornes.mbon.count;
  const groupe = (cible: (t: number) => boolean): PoidsGroupes => {
    let sF = 0, nF = 0, sT = 0, nT = 0, sO = 0, nO = 0;
    for (let i = v.bornes.kc.start; i < v.bornes.kc.start + v.bornes.kc.count; i++) {
      const estF = food.kcVus.has(i);
      const estT = toxin.kcVus.has(i);
      for (let e = topo.outOffsets[i]; e < topo.outOffsets[i + 1]; e++) {
        if (!cible(topo.outTarget[e])) continue;
        if (estF && !estT) { sF += topo.w[e]; nF++; }
        else if (estT && !estF) { sT += topo.w[e]; nT++; }
        else { sO += topo.w[e]; nO++; }
      }
    }
    return { f: sF / Math.max(1, nF), t: sT / Math.max(1, nT), autre: sO / Math.max(1, nO) };
  };
  return {
    food,
    toxin,
    poidsSer: groupe((t) => t >= ser0 && t < ser1),
    poidsMbon: groupe((t) => t >= mb0 && t < mb1),
  };
}

function experienceVoie(seed: number, lr: number, lesion?: "oa" | "da"): Mesure {
  const org = createOrganism(paramsAvecVoie(seed, lr));
  if (lesion) org.voie!.lesions[lesion] = true;
  const rng = mulberry32(seed * 7919);
  runOrganism(org, TICKS, rng);
  return {
    ateFood: org.metrics.ateFood,
    ateToxin: org.metrics.ateToxin,
    vies: org.metrics.lifetimes.length,
    reponse: sonderVoie(org, rng),
  };
}

describe("voie dans le monde — rang 5 (porte)", () => {
  it("sélectivité des poids, dissociation des lésions, gelé plat", () => {
    for (const seed of [1, 2]) {
      const plast = experienceVoie(seed, 0.05);
      const gele = experienceVoie(seed, 0);
      const lOA = experienceVoie(seed, 0.05, "oa");
      const lDA = experienceVoie(seed, 0.05, "da");

      // Le monde fournit les deux types de rencontres et des vies closes.
      expect(plast.ateFood).toBeGreaterThan(100);
      expect(plast.ateToxin).toBeGreaterThan(20);
      expect(plast.vies).toBeGreaterThan(50);

      const { poidsSer, poidsMbon, food, toxin } = plast.reponse;
      console.log(
        `seed ${seed} plastique : SER(t)=${toxin.s} SER(f)=${food.s} | ` +
          `w(SER) t=${poidsSer.t.toFixed(3)} f=${poidsSer.f.toFixed(3)} ∅=${poidsSer.autre.toFixed(3)} | ` +
          `w(MBON) f=${poidsMbon.f.toFixed(3)} t=${poidsMbon.t.toFixed(3)} ∅=${poidsMbon.autre.toFixed(3)} | ` +
          `toxin=${plast.ateToxin}/${gele.ateToxin} food=${plast.ateFood}/${gele.ateFood}`,
      );

      // Poids sélectifs : l'aversif apprend la toxine, l'appétitif la nourriture.
      expect(poidsSer.t).toBeGreaterThan(0.1);
      expect(poidsSer.t).toBeGreaterThan(4 * poidsSer.f);
      expect(poidsMbon.f).toBeGreaterThan(0.5);
      expect(poidsMbon.f).toBeGreaterThan(4 * poidsMbon.t);

      // Réponses sondées : la sortie aversive répond plus à la toxine, la
      // sortie appétitive plus à la nourriture.
      expect(toxin.s).toBeGreaterThan(1.5 * food.s);
      expect(food.m).toBeGreaterThan(1.5 * toxin.m);

      // Lésions dissociées : chaque canal tué épargne l'autre.
      expect(lOA.reponse.poidsSer.t).toBeGreaterThan(4 * lOA.reponse.poidsSer.f);
      expect(lOA.reponse.poidsMbon.f).toBeLessThan(0.05);
      expect(lDA.reponse.poidsMbon.f).toBeGreaterThan(4 * lDA.reponse.poidsMbon.t);
      expect(lDA.reponse.poidsSer.t).toBeLessThan(0.05);

      // Gelé : rien n'apprend, les réponses restent au niveau naïf.
      expect(gele.reponse.poidsSer.t).toBeLessThan(0.02);
      expect(gele.reponse.poidsMbon.f).toBeLessThan(0.02);
      expect(gele.reponse.toxin.s).toBeLessThan(60);

      // Comportement : moins de toxine consommée qu'à voie gelée — la
      // nourriture, elle, tient (mesuré ~0,3–0,6× et ~0,8–1,5×).
      expect(plast.ateToxin).toBeLessThan(0.75 * gele.ateToxin);
      expect(plast.ateFood).toBeGreaterThan(0.6 * gele.ateFood);
    }
  }, 60 * 60_000);

  it("reproductibilité : même graine, mêmes comptes", () => {
    const a = experienceVoie(7, 0.05);
    const b = experienceVoie(7, 0.05);
    expect(b.ateFood).toBe(a.ateFood);
    expect(b.ateToxin).toBe(a.ateToxin);
    expect(b.vies).toBe(a.vies);
  }, 60 * 60_000);
});
