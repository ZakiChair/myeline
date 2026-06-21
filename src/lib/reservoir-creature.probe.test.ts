import { describe, it, expect } from "vitest";
import { makeReservoirCreature, stepCreature } from "./reservoir-creature";

// GATE DE FOURRAGE INCARNÉ — la créature à réservoir apprend-elle réellement à fourrager ?
// L'apprenant (readout modulé par récompense) doit manger BIEN PLUS qu'un témoin à politique
// gelée (learn=false ⇒ poids restent 0 ⇒ politique uniforme ⇒ marche au hasard). Et le taux
// de fourrage doit MONTER au fil du temps (2e moitié > 1re moitié).

const TICKS = 3000;
const SEEDS = [1, 2, 3, 4, 5, 6];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

function runEaten(seed: number, learn: boolean): { eaten: number; firstHalf: number; secondHalf: number } {
  const c = makeReservoirCreature(seed, learn);
  let mid = 0;
  for (let t = 0; t < TICKS; t++) {
    if (t === TICKS / 2) mid = c.world.eaten;
    stepCreature(c);
  }
  return { eaten: c.world.eaten, firstHalf: mid, secondHalf: c.world.eaten - mid };
}

describe("[GATE RC] fourrage incarné : la créature apprend à manger", () => {
  it("apprenant ≫ témoin gelé, et le taux de fourrage monte", () => {
    const learner = SEEDS.map((s) => runEaten(s, true));
    const control = SEEDS.map((s) => runEaten(s + 500, false));

    const mLearn = mean(learner.map((r) => r.eaten));
    const mCtrl = mean(control.map((r) => r.eaten));
    const mFirst = mean(learner.map((r) => r.firstHalf));
    const mSecond = mean(learner.map((r) => r.secondHalf));

    console.log(
      `\n[GATE RC fourrage] pastilles mangées (${TICKS} ticks, ${SEEDS.length} graines) :\n` +
        `  apprenant : ${mLearn.toFixed(1)}  vs  témoin gelé : ${mCtrl.toFixed(1)}\n` +
        `  apprenant 1re→2e moitié : ${mFirst.toFixed(1)} → ${mSecond.toFixed(1)}\n` +
        `[GATE RC fourrage] → ${mLearn > mCtrl * 1.5 && mSecond > mFirst ? "GO ✅" : "NO-GO ❌"}\n`,
    );

    expect(mLearn).toBeGreaterThan(mCtrl * 1.5); // forage bien mieux que le hasard
    expect(mSecond).toBeGreaterThan(mFirst); // s'améliore au fil du temps
  });
});
