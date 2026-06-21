import { describe, it, expect } from "vitest";
import { makeCreatureBrain } from "./creature";
import { initWorld, stepWorld, type CreatureState } from "./world";
import { mulberry32 } from "./rng";
import type { Action } from "./creature";

// La boucle INCARNÉE apprend-elle de façon VISIBLE ? Métrique honnête (philosophie 3-bras
// du projet) : un APPRENANT (reward ssi action « approcher »=B) contre un TÉMOIN sans
// récompense (qui ne peut pas apprendre). L'apprenant choisit B bien plus souvent ET
// fourrage mieux (atteint plus de pastilles) — c'est l'apprentissage rendu visible.

const TRIALS = 240;

function runWorld(rewardFor: (a: Action) => number): { fracB: number; eaten: number } {
  const brain = makeCreatureBrain();
  const world: CreatureState = initWorld(mulberry32(42));
  const explore = mulberry32(7);
  const step = mulberry32(0); // non consommé (spontaneous=0)
  const spawn = mulberry32(99);
  let nB = 0;
  for (let t = 0; t < TRIALS; t++) {
    stepWorld(world, brain, explore, step, spawn, rewardFor);
    if (world.lastAction === "B") nB++;
  }
  return { fracB: nB / TRIALS, eaten: world.eaten };
}

describe("monde créature v1 — l'apprentissage devient visible", () => {
  it("apprenant ≫ témoin : choisit « approcher » et fourrage mieux", () => {
    const learner = runWorld((a) => (a === "B" ? 1 : 0));
    const control = runWorld(() => 0); // aucune récompense ⇒ marche au hasard

    expect(learner.fracB).toBeGreaterThan(0.85); // l'approche domine après apprentissage
    expect(learner.fracB).toBeGreaterThan(control.fracB + 0.25); // gain réel vs témoin
    expect(learner.eaten).toBeGreaterThan(control.eaten); // fourrage plus efficace
    expect(learner.eaten).toBeGreaterThan(0); // atteint réellement des pastilles
  });
});
