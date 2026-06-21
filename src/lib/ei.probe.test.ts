import { describe, it, expect } from "vitest";
import { createScaleGraph, stepScale } from "./scale-engine";
import { estimateBranching } from "./criticality";
import { mulberry32 } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimParams } from "./types";

// SONDE JETABLE — effet de l'inhibition (loi de Dale) sur le régime.
// La critique a prévenu : « σ se rapproche de 1 » peut être un FAUX POSITIF par
// extinction partielle (moins d'activité ⇒ branchement plus bas). D'où le GARDE-FOU :
// on rapporte aussi l'activité moyenne ; un σ proche de 1 obtenu par effondrement
// de l'activité ne compte PAS. On mesure aussi un rythme (autocorrélation > R+1).

const N = 400;
const R = 2;

/** Autocorrélation d'une série ; renvoie le lag (> R+1) de plus forte corrélation. */
function rhythmPeak(x: number[]): { lag: number; corr: number } {
  const m = x.reduce((a, b) => a + b, 0) / x.length;
  const v = x.reduce((a, b) => a + (b - m) ** 2, 0) || 1;
  let best = { lag: 0, corr: 0 };
  for (let lag = R + 2; lag <= 14; lag++) {
    let c = 0;
    for (let t = 0; t + lag < x.length; t++) c += (x[t] - m) * (x[t + lag] - m);
    const corr = c / v;
    if (corr > best.corr) best = { lag, corr };
  }
  return best;
}

function run(inhibRatio: number): { meanFrac: number; sigma: number; peak: { lag: number; corr: number } } {
  const p: SimParams = { ...DEFAULT_PARAMS, initialCount: N, populationCap: N, inhibRatio, hebbian: true, spontaneous: 0.01 };
  const g = createScaleGraph(p, mulberry32(7));
  const rng = mulberry32(123);
  const excited: number[] = [];
  for (let t = 1; t <= 320; t++) excited.push(stepScale(g, p, rng, t % p.developEvery === 0).events.excited);
  const tail = excited.slice(-200);
  const meanFrac = tail.reduce((a, b) => a + b, 0) / tail.length / Math.max(1, g.count);
  return { meanFrac, sigma: estimateBranching(tail), peak: rhythmPeak(tail) };
}

describe("[SONDE] effet de l'inhibition E/I", () => {
  it("compare 100% excitateur vs 80/20 E/I (activité = garde-fou, σ, rythme)", () => {
    const exc = run(0);
    const ei = run(0.2);
    const fmt = (r: typeof exc) =>
      `activité≈${(r.meanFrac * 100).toFixed(1)}%  σ≈${r.sigma.toFixed(3)}  rythme(lag=${r.peak.lag}, corr=${r.peak.corr.toFixed(2)})`;
    // eslint-disable-next-line no-console
    console.log("\n[SONDE E/I] 100% excitateur : " + fmt(exc));
    // eslint-disable-next-line no-console
    console.log("[SONDE E/I] 80/20 E/I      : " + fmt(ei));
    const extinction = ei.meanFrac < 0.01;
    // eslint-disable-next-line no-console
    console.log(
      `[SONDE E/I] → garde-fou activité : ${extinction ? "⚠️ EXTINCTION (σ non interprétable)" : "OK"} ; ` +
        `|σ−1| ${Math.abs(ei.sigma - 1) < Math.abs(exc.sigma - 1) ? "DIMINUE" : "n'améliore pas"} avec E/I ; ` +
        `rythme E/I ${ei.peak.corr > 0.2 ? "pic net" : "faible"}\n`,
    );
    expect(Number.isFinite(ei.sigma) && Number.isFinite(exc.sigma)).toBe(true);
  });
});
