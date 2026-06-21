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
  decayEligibility,
  applyReward,
} from "./reservoir";
import { mulberry32 } from "./rng";

// SOUS-GATE 3 — RÉCOMPENSE DIFFÉRÉE. L'incarnation l'exige : agir maintenant, conséquence
// (manger) plus tard. La trace d'éligibilité bridge-t-elle le délai action→récompense ?
// Contraste : λ>0 (trace persiste) DOIT apprendre malgré le délai ; λ=0 (pas de trace) NE
// PEUT PAS créditer une récompense différée. Cue présent à la décision (perception facile)
// pour isoler le crédit TEMPOREL, pas la mémoire (= sous-gate 2).

const SIZE = 300;
const CHANNELS = 2;
const ACTIONS = 2;
const TRIALS = 400;
const MEASURE = 80;
const ETA = 0.08;
const ALPHA = 0.05;
const fp = reservoirParams(0.21);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

/** Apprend la discrimination cue→action avec récompense différée de `rewardDelay` ticks. */
function runArm(seed: number, lambda: number, rewardDelay: number): number {
  const res = makeReservoir(SIZE, CHANNELS, seed);
  const ro = makeReadout(ACTIONS, res.readNeurons.length);
  const cueRng = mulberry32(seed * 7 + 1);
  const exploreRng = mulberry32(seed * 13 + 3);
  let correctCount = 0;
  for (let t = 0; t < TRIALS; t++) {
    const cue = cueRng() < 0.5 ? 0 : 1;
    const feat = presentAndRead(res, [cue], fp);
    const p = policy(ro, feat);
    const action = sampleAction(p, exploreRng);
    resetEligibility(ro);
    accumulateEligibility(ro, feat, action, p, lambda);
    for (let d = 0; d < rewardDelay; d++) decayEligibility(ro, lambda); // le temps passe
    const reward = action === cue ? 1 : 0;
    applyReward(ro, reward, ETA, ALPHA);
    if (t >= TRIALS - MEASURE && action === cue) correctCount++;
  }
  return correctCount / MEASURE;
}

describe("[GATE RC] sous-gate 3 : la trace d'éligibilité crédite la récompense différée", () => {
  it("λ>0 apprend malgré le délai ; λ=0 échoue ; l'horizon de crédit est fini", () => {
    const DELAY = 4;
    const withTrace = mean(SEEDS.map((s) => runArm(s, 0.9, DELAY)));
    const noTrace = mean(SEEDS.map((s) => runArm(s, 0, DELAY)));

    // Horizon : λ fixe, le délai grandit → la perf décroît (trace finie).
    const horizon: string[] = ["délai | acc (λ=0.9)"];
    const accByDelay: number[] = [];
    for (const d of [0, 2, 4, 8]) {
      const a = mean(SEEDS.map((s) => runArm(s, 0.9, d)));
      accByDelay.push(a);
      horizon.push(`  ${d}   |   ${a.toFixed(2)}`);
    }

    console.log(
      `\n[GATE RC sous-gate 3] récompense différée (délai=${DELAY}) : λ=0.9 → ${withTrace.toFixed(2)} | λ=0 → ${noTrace.toFixed(2)}`,
    );
    console.log("[GATE RC sous-gate 3] horizon de crédit :\n" + horizon.join("\n"));
    console.log(
      `[GATE RC sous-gate 3] → ${withTrace > 0.8 && withTrace > noTrace + 0.25 ? "GO ✅" : "NO-GO ❌"} (la trace bridge le délai)\n`,
    );

    // GO : la trace permet le crédit différé, son absence l'interdit.
    expect(withTrace).toBeGreaterThan(0.8);
    expect(withTrace).toBeGreaterThan(noTrace + 0.25);
    expect(accByDelay[0]).toBeGreaterThan(0.85); // délai 0 = facile
  });
});
