import { describe, it, expect } from "vitest";
import { createMetrics, recordTick, recordEvent, summarize, splitHalves, median } from "./metrics";

describe("median", () => {
  it("gère les tailles paires et impaires, et le vide", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it("ne modifie pas le tableau qu'on lui passe", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("splitHalves", () => {
  it("coupe au milieu du TEMPS, pas au milieu du nombre de vies", () => {
    // Trois vies courtes puis une très longue : la coupe temporelle isole la longue.
    // Une coupe par le compte aurait mis 2 vies courtes d'un côté et 1 courte + 1 longue de
    // l'autre, ce qui gonflerait artificiellement la seconde moitié.
    expect(splitHalves([10, 10, 10, 200])).toEqual({ first: [10, 10, 10], second: [200] });
  });

  it("répartit équitablement quand les vies sont égales", () => {
    expect(splitHalves([10, 10])).toEqual({ first: [10], second: [10] });
    expect(splitHalves([5, 5, 5, 5])).toEqual({ first: [5, 5], second: [5, 5] });
  });

  it("renvoie deux moitiés vides pour un journal vide", () => {
    expect(splitHalves([])).toEqual({ first: [], second: [] });
  });

  it("conserve toutes les vies", () => {
    const vies = [12, 40, 7, 300, 55];
    const { first, second } = splitHalves(vies);
    expect([...first, ...second]).toEqual(vies);
  });
});

describe("summarize", () => {
  it("calcule le ratio de toxine et l'énergie moyenne", () => {
    const m = createMetrics();
    for (let k = 0; k < 10; k++) recordTick(m, 50, 0);
    recordEvent(m, "FOOD", 100);
    recordEvent(m, "FOOD", 120);
    recordEvent(m, "TOXIN", 140);
    const r = summarize(m);
    expect(r.energyMean).toBe(50);
    expect(r.toxinRatio).toBeCloseTo(1 / 3, 6);
    expect(r.ticks).toBe(10);
    expect(r.foodPerMilleTicks).toBe(200);
  });

  it("renvoie NaN plutôt que 0 quand rien n'a été mangé", () => {
    // Un ratio de 0 se lirait comme « aucune toxine consommée », ce qui est faux : on n'a
    // simplement rien mesuré.
    const m = createMetrics();
    recordTick(m, 10, 0);
    expect(Number.isNaN(summarize(m).toxinRatio)).toBe(true);
    expect(Number.isNaN(summarize(m).lifetimeMedian)).toBe(true);
  });

  it("enregistre une durée de vie à chaque mort", () => {
    const m = createMetrics();
    recordEvent(m, "DEATH", 321);
    recordEvent(m, "DEATH", 654);
    expect(m.lifetimes).toEqual([321, 654]);
    expect(m.deaths).toBe(2);
    expect(summarize(m).lifetimeMedian).toBe((321 + 654) / 2);
  });

  it("compte les contacts du prédateur séparément", () => {
    const m = createMetrics();
    recordEvent(m, "PREDATOR", 0);
    expect(m.hits).toBe(1);
    expect(m.deaths).toBe(0);
  });

  it("moyenne la récompense sur les ticks", () => {
    const m = createMetrics();
    recordTick(m, 0, 1);
    recordTick(m, 0, -3);
    expect(summarize(m).rewardMean).toBe(-1);
  });
});
