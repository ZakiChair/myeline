// Protocole 1 : l'organisme apprend-il à rester en vie ?
//
// DISCIPLINE : les seuils de ce fichier sont issus de la mesure, jamais d'une intuition.
// Écrire « ×1,5 » en assertion avant d'avoir mesuré transformerait la tâche en recherche de
// paramètres déguisée en débogage.
//
// Les témoins (gelé, yoked, lésion) appartiennent au lot 3. Ici on établit seulement qu'il y
// a quelque chose à expliquer.
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { createOrganism, runOrganism, type OrganismOptions } from "./organism";
import { median, splitHalves, summarize } from "./metrics";
import { ORGANISME_DEFAUT } from "./params";

const TRANCHES = 8;

export interface Tranche {
  vies: number[];
  food: number;
  toxin: number;
  energie: number;
}

/** Fait vivre un organisme et renvoie sa progression par tranche d'expérience. */
export function experience(n: number, seed: number, ticks: number, options: OrganismOptions = {}) {
  const org = createOrganism(
    {
      ...ORGANISME_DEFAUT,
      worldSeed: 1000 + seed,
      brain: { ...ORGANISME_DEFAUT.brain, topology: { ...ORGANISME_DEFAUT.brain.topology, n, seed } },
    },
    options,
  );
  const rng = mulberry32(seed * 7919);
  const parTranche: Tranche[] = [];
  let refVies = 0;
  let refFood = 0;
  let refToxin = 0;
  for (let s = 0; s < TRANCHES; s++) {
    const e0 = org.metrics.energySum;
    const t0 = org.metrics.ticks;
    runOrganism(org, Math.floor(ticks / TRANCHES), rng);
    parTranche.push({
      vies: org.metrics.lifetimes.slice(refVies),
      food: org.metrics.ateFood - refFood,
      toxin: org.metrics.ateToxin - refToxin,
      energie: (org.metrics.energySum - e0) / (org.metrics.ticks - t0),
    });
    refVies = org.metrics.lifetimes.length;
    refFood = org.metrics.ateFood;
    refToxin = org.metrics.ateToxin;
  }
  const { first, second } = splitHalves(org.metrics.lifetimes);
  return { org, parTranche, first, second, resume: summarize(org.metrics) };
}

/** Ratio toxine/(toxine+nourriture) sur un groupe de tranches. NaN si rien n'a été mangé. */
export function ratioToxine(ts: Tranche[]): number {
  const tox = ts.reduce((s, t) => s + t.toxin, 0);
  const tot = ts.reduce((s, t) => s + t.food + t.toxin, 0);
  return tot > 0 ? tox / tot : NaN;
}

function journaliser(nom: string, r: ReturnType<typeof experience>) {
  // eslint-disable-next-line no-console
  console.log(
    `${nom} vies=${r.org.metrics.lifetimes.length} ` +
      `médiane 1re moitié=${median(r.first).toFixed(1)} 2e moitié=${median(r.second).toFixed(1)} ` +
      `ratio toxine début=${ratioToxine(r.parTranche.slice(0, 2)).toFixed(3)} ` +
      `fin=${ratioToxine(r.parTranche.slice(-2)).toFixed(3)} ` +
      `énergie moy=${r.resume.energyMean.toFixed(1)}`,
  );
  for (const [i, t] of r.parTranche.entries()) {
    // eslint-disable-next-line no-console
    console.log(
      `    tranche ${i}: vies=${t.vies.length} médiane=${median(t.vies).toFixed(1)} ` +
        `food=${t.food} toxin=${t.toxin} énergie=${t.energie.toFixed(1)}`,
    );
  }
}

describe("apprentissage (banc de mesure)", () => {
  // RÉSULTAT NÉGATIF, mesuré le 2026-07-30 : sur 400 000 ticks et trois graines, la durée de
  // vie ne progresse pas de façon distinguable du bruit, et le ratio toxine ne baisse pas.
  // Détail et hypothèses testées : docs/superpowers/notes/2026-07-30-vie-calibration.md.
  //
  // Ce fichier n'affirme donc AUCUN apprentissage. Il vérifie ce qui est effectivement
  // établi — la boucle vit, meurt, mange et reste reproductible — et sert de banc de
  // référence à qui reprendra le crédit temporel.
  it("journalise la progression sur plusieurs graines", () => {
    for (const seed of [1, 2, 3]) {
      journaliser(`graine=${seed}`, experience(2500, seed, 400_000));
    }
    expect(true).toBe(true); // banc de mesure, sans assertion d'apprentissage
  }, 1_800_000);

  it("produit une expérience exploitable : des vies closes et des rencontres des deux sortes", () => {
    // La porte que le lot 1 franchit RÉELLEMENT : l'expérience a de la matière. Sans elle,
    // un résultat négatif ne voudrait rien dire — on ne saurait pas si l'organisme n'apprend
    // pas ou s'il n'a simplement rien vécu.
    const r = experience(2500, 1, 100_000);
    expect(r.org.metrics.deaths).toBeGreaterThan(30);
    expect(r.org.metrics.ateFood).toBeGreaterThan(20);
    expect(r.org.metrics.ateToxin).toBeGreaterThan(5);
    expect(r.first.length).toBeGreaterThan(5);
    expect(r.second.length).toBeGreaterThan(5);
    expect(Number.isFinite(r.resume.energyMean)).toBe(true);
  }, 600_000);

  it("reste reproductible : même graine, même histoire", () => {
    const trace = () => {
      const r = experience(2500, 5, 60_000);
      return {
        vies: r.org.metrics.lifetimes,
        food: r.org.metrics.ateFood,
        toxin: r.org.metrics.ateToxin,
      };
    };
    expect(trace()).toEqual(trace());
  }, 600_000);
});
