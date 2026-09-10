// Banc de mesure : combien de ticks par seconde, et où part le temps ? Ces chiffres
// conditionnent la faisabilité de la preuve d'apprentissage (qui a besoin de beaucoup de
// ticks) et celle du lot 2 (qui a besoin de temps réel à pleine échelle).
//
// `performance.now()` est la seule entorse au déterminisme du noyau : il ne pilote aucune
// décision de simulation et ne sert qu'à journaliser une durée.
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { createOrganism, runOrganism } from "./organism";
import { ORGANISME_DEFAUT } from "./params";

function mesure(n: number, ticks: number, surPlasticite: Record<string, unknown> = {}) {
  const org = createOrganism({
    ...ORGANISME_DEFAUT,
    brain: {
      ...ORGANISME_DEFAUT.brain,
      plasticity: { ...ORGANISME_DEFAUT.brain.plasticity, ...surPlasticite },
      topology: { ...ORGANISME_DEFAUT.brain.topology, n, seed: 4 },
    },
  });
  const t0 = performance.now();
  runOrganism(org, ticks, mulberry32(1));
  const ms = performance.now() - t0;
  return { ms, tps: (ticks / ms) * 1000, e: org.brain.topo.e };
}

describe("budget", () => {
  it("journalise le débit à plusieurs tailles", () => {
    for (const n of [2500, 10_000, 50_000]) {
      const ticks = n >= 50_000 ? 1000 : 5000;
      const r = mesure(n, ticks);
      console.log(`n=${n} e=${r.e} ${r.ms.toFixed(0)} ms → ${r.tps.toFixed(0)} ticks/s`);
    }
    expect(true).toBe(true); // banc de mesure
  }, 600_000);

  it("mesure la part du balayage dopaminergique", () => {
    // Si le balayage domine, sa cadence divisée par 16 doit faire bondir le débit. C'est le
    // test qui décide s'il faut le repli sur un registre d'arêtes touchées.
    const normal = mesure(10_000, 5000);
    const rare = mesure(10_000, 5000, { dumpEvery: 256 });
    console.log(
      `dumpEvery=16 → ${normal.tps.toFixed(0)} ticks/s | ` +
        `dumpEvery=256 → ${rare.tps.toFixed(0)} ticks/s | ` +
        `part du balayage ≈ ${(100 * (1 - normal.tps / rare.tps)).toFixed(0)} %`,
    );
    expect(true).toBe(true); // banc de mesure
  }, 600_000);
});
