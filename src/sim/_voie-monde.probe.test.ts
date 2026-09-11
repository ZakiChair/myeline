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
    // Clone : l'extinction mutera lossToxin en cours de vie — ne pas toucher
    // l'objet partagé de ORGANISME_DEFAUT.
    world: { ...ORGANISME_DEFAUT.world },
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
      extDose: 4,
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
 *  appartenance. `codes` = les deux codes présentés (explicites : après inversion,
 *  `org.odeurFood` ne porte plus le code « nourriture » d'origine). */
function sonderVoie(
  org: Organism,
  rng: ReturnType<typeof mulberry32>,
  codes?: { a: NonNullable<Organism["odeurFood"]>; b: NonNullable<Organism["odeurToxin"]> },
) {
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
  const food = sondage(codes ? codes.a : org.odeurFood);
  const toxin = sondage(codes ? codes.b : org.odeurToxin);
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

  it("inversion : échanger les codes en cours de vie ré-apprend la carte", () => {
    for (const seed of [1, 2]) {
      const org = createOrganism(paramsAvecVoie(seed, 0.05));
      const codeA = org.odeurFood!;
      const codeB = org.odeurToxin!;
      const rng = mulberry32(seed * 7919);

      // Phase 1 : A = nourriture, B = toxine — apprentissage normal.
      runOrganism(org, TICKS, rng);
      const avant = sonderVoie(org, rng, { a: codeA, b: codeB });
      expect(avant.poidsSer.t).toBeGreaterThan(4 * avant.poidsSer.f);
      expect(avant.poidsMbon.f).toBeGreaterThan(4 * avant.poidsMbon.t);

      // INVERSION : le canal nourriture porte désormais le code B, le canal
      // toxine le code A. La carte synaptique doit suivre la contingence, pas
      // l'odeur : SER doit apprendre A (ex-nourriture), MBON doit apprendre B
      // (ex-toxine).
      org.odeurFood = codeB;
      org.odeurToxin = codeA;
      const f0 = org.metrics.ateFood;
      const t0 = org.metrics.ateToxin;
      runOrganism(org, TICKS, rng);
      const apres = sonderVoie(org, rng, { a: codeA, b: codeB });
      const food2 = org.metrics.ateFood - f0;
      const toxin2 = org.metrics.ateToxin - t0;
      console.log(
        `seed ${seed} inversion : w(SER|A) ${avant.poidsSer.f.toFixed(3)} → ${apres.poidsSer.f.toFixed(3)} | ` +
          `w(MBON|B) ${avant.poidsMbon.t.toFixed(3)} → ${apres.poidsMbon.t.toFixed(3)} | ` +
          `phase2 food=${food2} toxin=${toxin2}`,
      );

      // Les rencontres continuent après l'inversion.
      expect(food2).toBeGreaterThan(50);
      expect(toxin2).toBeGreaterThan(10);

      // Ré-apprentissage : les poids du code qui a CHANGÉ de valence croissent
      // sur l'autre canal — A (ex-nourriture) apprend l'aversif, B (ex-toxine)
      // apprend l'appétitif.
      expect(apres.poidsSer.f).toBeGreaterThan(0.1);
      expect(apres.poidsSer.f).toBeGreaterThan(8 * avant.poidsSer.f);
      expect(apres.poidsMbon.t).toBeGreaterThan(0.15);
      expect(apres.poidsMbon.t).toBeGreaterThan(8 * avant.poidsMbon.t);

      // Limite honnête du modèle : l'ancienne mémoire PERSISTE — rien ne
      // désapprend SER(B) ni MBON(A) : post-inversion leurs marques sont
      // étiquetées sous l'autre odeur et jamais consolidées par leur canal
      // (pas d'extinction). Documenté : la carte se réécrit par ajout, pas par
      // effacement. Marge 0,9 : les ensembles de répondeurs mesurés peuvent
      // bouger d'un epsilon entre sondages.
      expect(apres.poidsSer.t).toBeGreaterThan(avant.poidsSer.t * 0.9);
      expect(apres.poidsMbon.f).toBeGreaterThan(avant.poidsMbon.f * 0.9);
    }
  }, 60 * 60_000);

  it("extinction : la toxine devenue inerte est ré-approchée", () => {
    for (const seed of [1, 2]) {
      const org = createOrganism(paramsAvecVoie(seed, 0.05));
      const codeA = org.odeurFood!;
      const codeB = org.odeurToxin!;
      const rng = mulberry32(seed * 7919);

      // Phase 1 : apprentissage normal — SER apprend la toxine.
      runOrganism(org, TICKS, rng);
      const avant = sonderVoie(org, rng, { a: codeA, b: codeB });
      expect(avant.poidsSer.t).toBeGreaterThan(4 * avant.poidsSer.f);
      const t1 = org.metrics.ateToxin;

      // EXTINCTION : la toxine ne punit plus (ni énergie ni reward). Chaque
      // contact inerte = « CS sans US » → impulsion DA négative → les poids
      // SER←toxine se déconsolident.
      org.params.world.lossToxin = 0;
      org.params.world.rToxin = 0;
      const f0 = org.metrics.ateFood;
      runOrganism(org, TICKS, rng);
      const apres = sonderVoie(org, rng, { a: codeA, b: codeB });
      const toxin2 = org.metrics.ateToxin - t1;
      const food2 = org.metrics.ateFood - f0;
      console.log(
        `seed ${seed} extinction : w(SER|toxine) ${avant.poidsSer.t.toFixed(3)} → ${apres.poidsSer.t.toFixed(3)} | ` +
          `SER(t) ${avant.toxin.s} → ${apres.toxin.s} | ` +
          `phase2 food=${food2} toxin=${toxin2} (phase1 toxin=${t1})`,
      );

      // L'évitement s'éteint : les poids aversifs de la toxine retombent vers le
      // niveau naïf et la réponse SER à l'odeur décline.
      expect(apres.poidsSer.t).toBeLessThan(0.5 * avant.poidsSer.t);
      expect(apres.toxin.s).toBeLessThan(0.6 * avant.toxin.s);

      // Et le comportement récupère : plus de contacts toxine qu'en phase 1 —
      // l'organisme ré-approche la source devenue sûre. Dissociation : le canal
      // appétitif, lui, tient (MBON←nourriture conservé).
      expect(toxin2).toBeGreaterThan(t1);
      expect(apres.poidsMbon.f).toBeGreaterThan(0.8 * avant.poidsMbon.f);
    }
  }, 60 * 60_000);
});
