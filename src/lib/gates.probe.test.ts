import { describe, it, expect } from "vitest";
import { createScaleGraph, stepScale, type ScaleGraph } from "./scale-engine";
import { applyInput } from "./io";
import { estimateBranching } from "./criticality";
import { mulberry32 } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimParams } from "./types";

// SONDES JETABLES (cf. plan « socle d'abord, trancher après »). Ne valident pas un
// comportement : elles PRODUISENT les données de décision qui choisiront le sommet.
//   gate (a) — σ(φ) traverse-t-il 1 dans une plage de φ accessible ?
//   gate (b) — la plasticité déplace-t-elle σ vers 1 ?
// On lit les console.log ; les expect ne sont que des garde-fous (valeurs finies).

const N = 400;

function quiesce(g: ScaleGraph): void {
  g.state.fill(0);
  g.stateNext.fill(0);
  g.cooldown.fill(0);
}

function aliveSlots(g: ScaleGraph): number[] {
  const out: number[] = [];
  for (let i = 0; i < g.capacity; i++) if (g.alive[i]) out.push(i);
  return out;
}

/** σ d'une avalanche : seed K neurones, propage jusqu'à extinction (ou plafond). */
function avalancheSigma(
  g: ScaleGraph,
  params: SimParams,
  seeds: number[],
  maxTicks: number,
): number {
  quiesce(g);
  const hist: number[] = [seeds.length]; // génération 0 = les graines
  applyInput(g, seeds);
  const rng = mulberry32(1); // non consommé (spontaneous=0, develop=false)
  for (let t = 0; t < maxTicks; t++) {
    const { events } = stepScale(g, params, rng, false);
    hist.push(events.excited);
    if (events.excited === 0) break;
  }
  return estimateBranching(hist);
}

describe("GATE (a) — σ(φ) traverse-t-il 1 ?", () => {
  it("balaye φ et mesure le branchement par avalanches (poids uniformes, Hebb off)", () => {
    const base = createScaleGraph({ ...DEFAULT_PARAMS, initialCount: N, populationCap: N }, mulberry32(7));
    const slots = aliveSlots(base);
    const rng = mulberry32(999);
    const phis = [0.05, 0.08, 0.11, 0.14, 0.16, 0.2, 0.25, 0.3, 0.4];
    const M = 24;
    const rows: Array<[number, number]> = [];
    for (const phi of phis) {
      const p: SimParams = { ...DEFAULT_PARAMS, fireFraction: phi, spontaneous: 0, hebbian: false, populationCap: N };
      let sum = 0;
      for (let m = 0; m < M; m++) {
        const seeds: number[] = [];
        for (let s = 0; s < 5; s++) seeds.push(slots[Math.floor(rng() * slots.length)]);
        sum += avalancheSigma(base, p, seeds, 60);
      }
      rows.push([phi, sum / M]);
    }
    // eslint-disable-next-line no-console
    console.log("\n[GATE a] σ(φ)  (avg degré ≈ " + (base.edgeCount * 2 / N).toFixed(1) + ")");
    for (const [phi, sigma] of rows) {
      // eslint-disable-next-line no-console
      console.log(`  φ=${phi.toFixed(2)}  σ≈${sigma.toFixed(3)}  ${sigma >= 1 ? "≥1" : "<1"}`);
    }
    const crosses = rows.some(([, s]) => s >= 1) && rows.some(([, s]) => s < 1);
    // eslint-disable-next-line no-console
    console.log(`  → σ(φ) traverse 1 dans la plage : ${crosses ? "OUI ✅" : "NON ❌"}\n`);
    for (const [, s] of rows) expect(Number.isFinite(s)).toBe(true);
  });
});

describe("GATE (b) — la plasticité déplace-t-elle σ vers 1 ?", () => {
  it("compare σ (début vs fin) sous Hebb ON vs OFF, libre cours", () => {
    const T = 240;
    const run = (hebbian: boolean): { early: number; late: number } => {
      const g = createScaleGraph({ ...DEFAULT_PARAMS, initialCount: N, populationCap: N }, mulberry32(7));
      const p: SimParams = { ...DEFAULT_PARAMS, hebbian, spontaneous: 0.02, populationCap: N };
      const rng = mulberry32(123);
      const hist: number[] = [];
      for (let t = 1; t <= T; t++) hist.push(stepScale(g, p, rng, t % p.developEvery === 0).events.excited);
      const half = Math.floor(T / 2);
      return { early: estimateBranching(hist.slice(0, half)), late: estimateBranching(hist.slice(half)) };
    };
    const on = run(true);
    const off = run(false);
    // eslint-disable-next-line no-console
    console.log("\n[GATE b] σ début→fin (⚠️ contaminé par spontaneous, illustratif)");
    // eslint-disable-next-line no-console
    console.log(`  Hebb ON :  ${on.early.toFixed(3)} → ${on.late.toFixed(3)}  (|σ−1| fin = ${Math.abs(on.late - 1).toFixed(3)})`);
    // eslint-disable-next-line no-console
    console.log(`  Hebb OFF:  ${off.early.toFixed(3)} → ${off.late.toFixed(3)}  (|σ−1| fin = ${Math.abs(off.late - 1).toFixed(3)})`);
    const closer = Math.abs(on.late - 1) < Math.abs(off.late - 1);
    // eslint-disable-next-line no-console
    console.log(`  → la plasticité rapproche σ de 1 (fin) : ${closer ? "OUI ✅" : "NON ❌"}\n`);
    expect(Number.isFinite(on.late) && Number.isFinite(off.late)).toBe(true);
  });
});
