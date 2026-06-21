import { describe, it, expect } from "vitest";
import {
  makeReservoir,
  reservoirParams,
  presentAndRead,
  makeReadout,
  policy,
  sampleAction,
  resetEligibility,
  accumulateEligibility,
  applyReward,
} from "./reservoir";
import { mulberry32 } from "./rng";

// SOUS-GATE 1 — le MÉCANISME apprend-il ? La règle modulée par récompense (REINFORCE +
// éligibilité) apprend-elle une contingence sur un réservoir FIGÉ ? Tâche : discrimination
// de 2 cues (LEFT/RIGHT) → action correcte = le cue. 3 bras : APPRIS (reward ssi correct) ≫
// YOKED (même calendrier de reward, décorrélé) ≈ ALÉATOIRE (aucun reward).
// (À ce stade on prouve la RÈGLE, pas encore l'apport mémoire du réservoir = sous-gate 2.)

const SIZE = 300;
const CHANNELS = 2; // LEFT, RIGHT
const ACTIONS = 2;
const TRIALS = 400;
const MEASURE = 80; // accuracy sur les derniers essais
const ETA = 0.08;
const ALPHA_BASELINE = 0.05;
const fp = reservoirParams(0.21); // près de σ≈1

type RewardFn = (correct: boolean, t: number) => number;

function runArm(seed: number, rewardFor: RewardFn): { acc: number; calendar: number[] } {
  const res = makeReservoir(SIZE, CHANNELS, seed);
  const ro = makeReadout(ACTIONS, res.readNeurons.length);
  const cueRng = mulberry32(seed * 7 + 1);
  const exploreRng = mulberry32(seed * 13 + 3);
  const calendar: number[] = [];
  let correctCount = 0;
  for (let t = 0; t < TRIALS; t++) {
    const cue = cueRng() < 0.5 ? 0 : 1; // 0=LEFT, 1=RIGHT
    const feat = presentAndRead(res, [cue], fp);
    const p = policy(ro, feat);
    const action = sampleAction(p, exploreRng);
    const correct = action === cue; // mapping correct : action == cue
    const reward = rewardFor(correct, t);
    calendar.push(reward);
    resetEligibility(ro);
    accumulateEligibility(ro, feat, action, p, 0); // 1 décision/essai ⇒ lambda=0
    applyReward(ro, reward, ETA, ALPHA_BASELINE);
    if (t >= TRIALS - MEASURE && correct) correctCount++;
  }
  return { acc: correctCount / MEASURE, calendar };
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe("[GATE RC] sous-gate 1 : readout modulé par récompense apprend sur le réservoir", () => {
  it("APPRIS ≫ YOKED ≈ ALÉATOIRE (accuracy de discrimination 2-cues)", () => {
    const L: number[] = [];
    const Y: number[] = [];
    const Rn: number[] = [];
    for (const s of SEEDS) {
      const learned = runArm(s, (correct) => (correct ? 1 : 0));
      const yoked = runArm(s + 1000, (_c, t) => learned.calendar[t]); // reward décorrélé
      const random = runArm(s + 2000, () => 0);
      L.push(learned.acc);
      Y.push(yoked.acc);
      Rn.push(random.acc);
    }
    const mL = mean(L);
    const mY = mean(Y);
    const mR = mean(Rn);
    console.log(`\n[GATE RC sous-gate 1] accuracy (derniers ${MEASURE}/${TRIALS} essais), ${SEEDS.length} graines :`);
    console.log(`  APPRIS    ${mL.toFixed(2)}   (${L.map((d) => d.toFixed(2)).join(" ")})`);
    console.log(`  YOKED     ${mY.toFixed(2)}`);
    console.log(`  ALÉATOIRE ${mR.toFixed(2)}`);
    console.log(`[GATE RC sous-gate 1] → ${mL >= 0.8 && mL > mY + 0.2 && mL > mR + 0.2 ? "GO ✅" : "NO-GO ❌"}\n`);
    expect(mL).toBeGreaterThanOrEqual(0.8);
    expect(mL).toBeGreaterThan(mY + 0.2);
    expect(mL).toBeGreaterThan(mR + 0.2);
  });
});
