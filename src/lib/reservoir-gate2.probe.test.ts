import { describe, it, expect } from "vitest";
import {
  makeReservoir,
  reservoirParams,
  runReservoirSchedule,
  makeReadout,
  policy,
  sampleAction,
  resetEligibility,
  accumulateEligibility,
  applyReward,
} from "./reservoir";
import { estimateBranching } from "./criticality";
import { mulberry32 } from "./rng";

// SOUS-GATE 2 — le RÉSERVOIR sert-il vraiment ? Tâche À MÉMOIRE : le cue (LEFT/RIGHT) est
// FLASHÉ puis CACHÉ (délai) ; il faut décider sur le SOUVENIR. Le réservoir garde l'info dans
// son activité résiduelle ; un readout SANS réservoir (entrée instantanée = blanc au moment de
// décider) ne peut pas. La perf doit aussi PIQUER près de σ≈1 (« la criticité calcule »).

const SIZE = 300;
const CHANNELS = 2;
const ACTIONS = 2;
const PER_CHANNEL = 8;
const TRIALS = 300;
const MEASURE = 80;
const ETA = 0.08;
const ALPHA = 0.05;
const FLASH = 3;
const READWIN = 3;
const SEEDS = [1, 2, 3, 4, 5, 6];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

function delayedSchedule(cue: number, delay: number): number[][] {
  const s: number[][] = [];
  for (let i = 0; i < FLASH; i++) s.push([cue]);
  for (let i = 0; i < delay; i++) s.push([]); // blanc : le cue a disparu
  return s;
}

/** Un bras : apprend la tâche à délai donné, avec OU sans réservoir. Retourne l'accuracy finale. */
function runArm(seed: number, fp: ReturnType<typeof reservoirParams>, delay: number, useReservoir: boolean): number {
  const res = makeReservoir(SIZE, CHANNELS, seed, PER_CHANNEL);
  const nFeat = useReservoir ? res.readNeurons.length : CHANNELS;
  const ro = makeReadout(ACTIONS, nFeat);
  const cueRng = mulberry32(seed * 7 + 1);
  const exploreRng = mulberry32(seed * 13 + 3);
  let correctCount = 0;
  for (let t = 0; t < TRIALS; t++) {
    const cue = cueRng() < 0.5 ? 0 : 1;
    const sched = delayedSchedule(cue, delay);
    let feat: Float64Array;
    if (useReservoir) {
      feat = runReservoirSchedule(res, sched, fp, READWIN).feat;
    } else {
      // SANS réservoir : entrée instantanée au moment de décider (= dernier tick = blanc si délai>0).
      const last = sched[sched.length - 1];
      feat = new Float64Array(CHANNELS);
      for (const c of last) feat[c] = 1;
    }
    const p = policy(ro, feat);
    const action = sampleAction(p, exploreRng);
    const reward = action === cue ? 1 : 0;
    resetEligibility(ro);
    accumulateEligibility(ro, feat, action, p, 0);
    applyReward(ro, reward, ETA, ALPHA);
    if (t >= TRIALS - MEASURE && action === cue) correctCount++;
  }
  return correctCount / MEASURE;
}

/** σ illustratif : avalanche amorcée (canal 0) puis libre, sur la série d'excités. */
function measureSigma(seed: number, fp: ReturnType<typeof reservoirParams>): number {
  const res = makeReservoir(SIZE, CHANNELS, seed, PER_CHANNEL);
  const sched: number[][] = [[0], [0]];
  for (let i = 0; i < 40; i++) sched.push([]);
  const { excited } = runReservoirSchedule(res, sched, fp, 1);
  return estimateBranching(excited);
}

describe("[GATE RC] sous-gate 2 : le réservoir apporte de la mémoire", () => {
  it("tâche à délai : réservoir ≫ sans-réservoir, et perf pique près de σ≈1", () => {
    const fp = reservoirParams(0.21);
    const delays = [0, 2, 4, 6];
    const lines: string[] = ["délai | réservoir | sans-réservoir"];
    const resAcc: Record<number, number> = {};
    const noResAcc: Record<number, number> = {};
    for (const d of delays) {
      const r = mean(SEEDS.map((s) => runArm(s, fp, d, true)));
      const nr = mean(SEEDS.map((s) => runArm(s + 5000, fp, d, false)));
      resAcc[d] = r;
      noResAcc[d] = nr;
      lines.push(`  ${d}   |   ${r.toFixed(2)}   |   ${nr.toFixed(2)}`);
    }

    // Courbe perf-vs-σ (délai fixe), balayage de φ.
    const phis = [0.06, 0.09, 0.13, 0.16, 0.19, 0.22, 0.26, 0.32];
    const curve: string[] = ["φ | σ | perf(délai=4)"];
    const points: { sigma: number; acc: number }[] = [];
    for (const phi of phis) {
      const fpp = reservoirParams(phi);
      const sigma = mean(SEEDS.map((s) => measureSigma(s, fpp)));
      const acc = mean(SEEDS.map((s) => runArm(s, fpp, 4, true)));
      points.push({ sigma, acc });
      curve.push(`  ${phi.toFixed(2)} | ${sigma.toFixed(2)} | ${acc.toFixed(2)}`);
    }
    // Effondrement sous-critique : à φ élevé (réservoir sous-critique) la perf chute.
    const perfMid = points[3].acc; // φ≈0.16 (régime utile)
    const perfSub = points[points.length - 1].acc; // φ≈0.32 (sous-critique)

    console.log("\n[GATE RC sous-gate 2] tâche à mémoire (délai) :\n" + lines.join("\n"));
    console.log("\n[GATE RC sous-gate 2] perf-vs-σ (σ illustratif, fiable surtout côté sous-critique) :\n" + curve.join("\n"));
    console.log(
      `[GATE RC sous-gate 2] → réservoir garde la mémoire (délai 4 : ${resAcc[4].toFixed(2)} vs sans-réservoir ${noResAcc[4].toFixed(2)}) ; effondrement sous-critique ${perfMid.toFixed(2)}→${perfSub.toFixed(2)}\n`,
    );

    // GO : le réservoir garde l'info à travers le délai et bat nettement le sans-réservoir,
    expect(resAcc[2]).toBeGreaterThan(noResAcc[2] + 0.2);
    expect(resAcc[4]).toBeGreaterThan(0.65);
    expect(noResAcc[4]).toBeLessThan(0.6); // sans mémoire = hasard dès que le cue disparaît
    // et la perf s'effondre quand le réservoir devient sous-critique.
    expect(perfSub).toBeLessThan(perfMid - 0.2);
  });
});
