import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { EMPREINTE_TABLE, empreinteTable, gaussTable, TAILLE_TABLE, tableGauss } from "./bruit";

describe("bruit gaussien par table", () => {
  it("a les moments d'une gaussienne centrée réduite", () => {
    const t = tableGauss();
    let s = 0;
    let s2 = 0;
    for (let k = 0; k < t.length; k++) {
      s += t[k];
      s2 += t[k] * t[k];
    }
    expect(s / t.length).toBeCloseTo(0, 2);
    expect(Math.sqrt(s2 / t.length)).toBeCloseTo(1, 2);
  });

  it("a une queue plausible : des tirages au-delà de 3 sigma, aucun absurde", () => {
    const t = tableGauss();
    let au3 = 0;
    let max = 0;
    for (let k = 0; k < t.length; k++) {
      const a = Math.abs(t[k]);
      if (a > 3) au3++;
      if (a > max) max = a;
    }
    // 0,27 % attendus au-delà de 3 sigma pour une gaussienne.
    expect(au3 / t.length).toBeGreaterThan(0.001);
    expect(au3 / t.length).toBeLessThan(0.006);
    expect(max).toBeGreaterThan(4);
    expect(max).toBeLessThan(7);
  });

  it("a une taille qui rend la réutilisation négligeable à grande échelle", () => {
    // À n = 10^6, une table de 2^16 serait relue ~15 fois par tick, ce qui corrélerait
    // spatialement les neurones au sein d'un tick — or le régime spontané du réseau est
    // PORTÉ par le bruit. 2^20 ramène la réutilisation à ~1.
    expect(TAILLE_TABLE).toBe(1 << 20);
    expect(tableGauss().length).toBe(1 << 20);
  });

  it("est déterministe pour une graine donnée", () => {
    const tire = () => {
      const r = mulberry32(5);
      return Array.from({ length: 200 }, () => gaussTable(r));
    };
    expect(tire()).toEqual(tire());
  });

  it("consomme exactement un appel RNG par tirage", () => {
    // Box–Muller en consommait deux. Le flux du RNG change donc, et avec lui la dynamique :
    // c'est assumé au lot 0, où toute la calibration est refaite.
    let appels = 0;
    const r = mulberry32(5);
    const compte = () => {
      appels++;
      return r();
    };
    for (let k = 0; k < 100; k++) gaussTable(compte);
    expect(appels).toBe(100);
  });

  it("balaie toute la table : aucun indice inatteignable", () => {
    const vus = new Set<number>();
    const r = mulberry32(77);
    for (let k = 0; k < 200_000; k++) vus.add(Math.floor(r() * TAILLE_TABLE));
    // 200 000 tirages dans 2^20 cases : on en touche ~17 %. Ce qu'on vérifie est que
    // l'indexation couvre bien toute l'étendue, pas qu'elle sature.
    let min = Infinity;
    let max = -Infinity;
    for (const v of vus) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeLessThan(TAILLE_TABLE * 0.001);
    expect(max).toBeGreaterThan(TAILLE_TABLE * 0.999);
  });

  it("VECTEUR D'OR : la table a exactement les mêmes bits qu'au jour de sa création", () => {
    // La table est construite avec Math.log et Math.cos, qui ne sont PAS spécifiés au bit
    // près par ECMAScript. Le stockage en Float32Array absorbe l'écart — mesuré le
    // 2026-07-30 : 0 différence sur 10^7 tirages entre V8 et JSC — mais c'est une garantie
    // PROBABILISTE, pas une garantie de spécification. Ce test la rend VÉRIFIABLE : si un
    // moteur ou une version future casse l'hypothèse, il échoue bruyamment au lieu de
    // laisser un run se corrompre en silence.
    expect(empreinteTable()).toBe(EMPREINTE_TABLE);
  });
});
