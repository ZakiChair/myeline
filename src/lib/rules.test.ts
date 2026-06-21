import { describe, it, expect } from "vitest";
import { firesByThreshold, isInhibitory } from "./rules";

// Prédicat partagé par les deux moteurs : un neurone au repos décharge si la
// FRACTION PONDÉRÉE de ses voisins excités (somme des poids des voisins excités /
// somme des poids de tous les voisins) atteint le seuil φ. Normalisé → poids
// uniformes ⇒ équivaut à la fraction brute des anciens tests (anti-régression).
describe("firesByThreshold", () => {
  it("décharge quand la fraction pondérée atteint φ", () => {
    expect(firesByThreshold(10, 20, 0.4)).toBe(true); // 0.5 ≥ 0.4
  });

  it("ne décharge pas sous le seuil", () => {
    expect(firesByThreshold(5, 20, 0.4)).toBe(false); // 0.25 < 0.4
  });

  it("décharge à l'égalité exacte (≥)", () => {
    expect(firesByThreshold(4, 10, 0.4)).toBe(true); // 0.4 ≥ 0.4
  });

  it("ne décharge jamais sans voisins (poids total nul)", () => {
    expect(firesByThreshold(0, 0, 0.16)).toBe(false);
  });

  it("équivaut à la fraction brute quand les poids sont uniformes", () => {
    // Mêmes scénarios que les tests de décharge existants (φ=0.4, poids 5).
    expect(firesByThreshold(2 * 5, 4 * 5, 0.4)).toBe(true); // 2/4 = 0.5
    expect(firesByThreshold(1 * 5, 4 * 5, 0.4)).toBe(false); // 1/4 = 0.25
  });

  it("un drive net négatif (inhibition dominante) ne décharge jamais", () => {
    expect(firesByThreshold(-10, 20, 0.4)).toBe(false);
  });
});

describe("isInhibitory (assignation déterministe, loi de Dale)", () => {
  it("aucun inhibiteur quand inhibRatio = 0", () => {
    for (let i = 0; i < 20; i++) expect(isInhibitory(i, 0)).toBe(false);
  });

  it("≈ 20 % d'inhibiteurs par stride à inhibRatio = 0.2 (déterministe, zéro rng)", () => {
    let inhib = 0;
    for (let i = 0; i < 100; i++) if (isInhibitory(i, 0.2)) inhib++;
    expect(inhib).toBe(20); // stride 5 → i%5===4
  });
});
