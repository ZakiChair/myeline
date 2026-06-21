import { describe, it, expect } from "vitest";
import { estimateBranching } from "./criticality";

// σ illustratif = moyenne de excited(t+1)/excited(t) sur les ticks où excited(t)>0.
describe("estimateBranching (σ illustratif)", () => {
  it("activité constante → σ = 1 (criticité)", () => {
    expect(estimateBranching([4, 4, 4, 4])).toBeCloseTo(1);
  });

  it("activité qui double → σ = 2 (sur-critique)", () => {
    expect(estimateBranching([1, 2, 4, 8])).toBeCloseTo(2);
  });

  it("activité qui décroît → σ = 0.5 (sous-critique)", () => {
    expect(estimateBranching([8, 4, 2, 1])).toBeCloseTo(0.5);
  });

  it("ignore les ticks où excited(t)=0 (pas de division par zéro)", () => {
    // ratios : 2/4=0.5, 0/2=0 ; la transition 0→3 est ignorée (excited(t)=0).
    expect(estimateBranching([4, 2, 0, 3])).toBeCloseTo(0.25);
  });

  it("renvoie 0 si aucun ratio mesurable", () => {
    expect(estimateBranching([])).toBe(0);
    expect(estimateBranching([0, 0, 0])).toBe(0);
  });
});
