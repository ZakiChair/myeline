// Sonde : que vit réellement l'organisme ? Cadence de décision, répartition des actions,
// rencontres, taux cortical. Ces chiffres conditionnent la faisabilité de la tâche 9 : un
// organisme qui ne rencontre jamais rien ne peut rien apprendre.
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { createOrganism, stepOrganism } from "./organism";
import { poolRange, regionById } from "./topology";
import { summarize } from "./metrics";
import { ACTIONS, ORGANISME_DEFAUT, type MotorAction } from "./params";

function vecu(
  n: number,
  seed: number,
  ticks: number,
  surCerveau: Record<string, unknown> = {},
  surMonde: Record<string, unknown> = {},
) {
  const org = createOrganism({
    ...ORGANISME_DEFAUT,
    world: { ...ORGANISME_DEFAUT.world, ...surMonde },
    brain: {
      ...ORGANISME_DEFAUT.brain,
      ...surCerveau,
      topology: { ...ORGANISME_DEFAUT.brain.topology, n, seed },
    },
  });
  const rng = mulberry32(seed * 7919);
  const compte: Record<MotorAction, number> = { GAUCHE: 0, DROITE: 0, AVANCER: 0, STOP: 0 };
  const intervalles: number[] = [];
  let depuis = 0;
  let accMax = 0;
  let parTimeout = 0;
  const accSomme = [0, 0, 0, 0];
  for (let k = 0; k < ticks; k++) {
    const { action } = stepOrganism(org, rng);
    for (let k = 0; k < 4; k++) {
      accSomme[k] += org.brain.acc[k];
      if (org.brain.acc[k] > accMax) accMax = org.brain.acc[k];
    }
    depuis++;
    if (action !== null) {
      compte[action]++;
      intervalles.push(depuis);
      if (depuis >= org.brain.params.accTimeout) parTimeout++;
      depuis = 0;
    }
  }
  const ctx = regionById(org.brain.topo, "CORTEX");
  const mot = regionById(org.brain.topo, "MOTOR");
  const tauxPool = ACTIONS.map((_, k) => {
    let s = 0;
    const { start, end } = poolRange(mot, k);
    for (let i = start; i < end; i++) s += org.brain.lif.spikeTotal[i];
    return s / (mot.poolSize * ticks);
  });
  let spikesCtx = 0;
  for (let i = ctx.start; i < ctx.start + ctx.count; i++) spikesCtx += org.brain.lif.spikeTotal[i];
  return {
    org,
    compte,
    decisions: intervalles.length,
    parTimeout,
    intervalleMedian: intervalles.length
      ? [...intervalles].sort((a, b) => a - b)[intervalles.length >> 1]
      : NaN,
    tauxCortical: spikesCtx / (ctx.count * ticks),
    tauxPool,
    accMax,
    accMoyen: accSomme.map((v) => v / ticks),
    resume: summarize(org.metrics),
  };
}

describe("vécu de l'organisme", () => {
  it("journalise le vécu de l'organisme dans le monde retenu", () => {
    for (const seed of [4, 11, 23]) {
      const r = vecu(2500, seed, 20_000);
      const actions = ACTIONS.map((a) => `${a}=${r.compte[a]}`).join(" ");
      const renc = r.org.metrics.ateFood + r.org.metrics.ateToxin;
      console.log(
        `graine=${seed} décisions=${r.decisions} (dont ${r.parTimeout} par timeout) ` +
          `intervalle médian=${r.intervalleMedian} taux cortical=${r.tauxCortical.toFixed(4)}\n    ${actions}\n    ` +
          `food=${r.org.metrics.ateFood} toxin=${r.org.metrics.ateToxin} morts=${r.org.metrics.deaths} ` +
          `vie médiane=${r.resume.lifetimeMedian} rencontres/vie=${(renc / Math.max(1, r.org.metrics.deaths)).toFixed(2)} ` +
          `ratio toxine=${r.resume.toxinRatio.toFixed(3)}`,
      );
    }
    expect(true).toBe(true); // banc de mesure
  }, 600_000);
});
