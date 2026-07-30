import { describe, it, expect } from "vitest";
import {
  DELAI_MAX_SECONDES,
  DT_DEFAUT,
  LIF_SECONDES,
  PLASTICITE_SECONDES,
  enTicks,
  resoudreDelaiMax,
  resoudreLif,
  resoudrePlasticite,
} from "./temps";

describe("conversion secondes → ticks", () => {
  it("convertit exactement à dt = 1 ms", () => {
    const a: string[] = [];
    expect(enTicks(0.02, 0.001, "tauM", a)).toBe(20);
    expect(enTicks(0.003, 0.001, "refrac", a)).toBe(3);
    expect(a).toEqual([]);
  });

  it("refuse un dt non positif", () => {
    expect(() => enTicks(0.02, 0, "tauM", [])).toThrow();
    expect(() => enTicks(0.02, -1, "tauM", [])).toThrow();
  });

  it("plancher à 1 tick, et AVERTIT en nommant la constante rabotée", () => {
    const a: string[] = [];
    expect(enTicks(0.003, 0.01, "refrac", a)).toBe(1);
    expect(a).toHaveLength(1);
    expect(a[0]).toContain("refrac");
    expect(a[0]).toContain("0,30"); // la valeur brute, en notation française
    expect(a[0]).toContain("plancher");
  });

  it("AVERTIT aussi quand l'arrondi déforme la constante sans la raboter", () => {
    // Le cas que le seul plancher laisserait passer : 2,5 ticks arrondit à 3, valeur
    // parfaitement valide — mais la constante a pris 20 % de plus que demandé. Ne surveiller
    // que le plancher laisserait passer exactement ce genre de dérive silencieuse.
    const a: string[] = [];
    expect(enTicks(0.0025, 0.001, "exemple", a)).toBe(3);
    expect(a).toHaveLength(1);
    expect(a[0]).toContain("exemple");
    expect(a[0]).toContain("20,00 %");
    expect(a[0]).not.toContain("plancher");
  });

  it("ne dit rien quand l'arrondi est fidèle", () => {
    const a: string[] = [];
    expect(enTicks(0.02, 0.001, "tauM", a)).toBe(20);
    expect(enTicks(0.0203, 0.001, "presque", a)).toBe(20); // 1,5 % d'écart : toléré
    expect(a).toEqual([]);
  });
});

describe("résolution des paramètres à l'horloge de référence", () => {
  it("reproduit EXACTEMENT les constantes LIF actuelles à dt = 1 ms", () => {
    // Épinglage : le passage aux secondes ne doit RIEN changer à l'horloge de référence.
    // Si ce test tombe, c'est qu'une constante en secondes a été mal traduite.
    //
    // ⚠️ Les valeurs attendues sont des ENTIERS LITTÉRAUX, recopiés du noyau d'avant le lot 0.
    // Les comparer à LIF_DEFAUT serait une tautologie depuis que LIF_DEFAUT en DÉRIVE : les deux
    // côtés viendraient du même calcul et le test passerait quelle que soit l'erreur.
    const { params, avertissements } = resoudreLif(LIF_SECONDES, DT_DEFAUT);
    expect(params.tauM).toBe(20);
    expect(params.tauS).toBe(5);
    expect(params.tauThr).toBe(120);
    expect(params.refrac).toBe(3);
    expect(params.thrJump).toBe(0.18);
    expect(params.noise).toBe(0.08);
    expect(avertissements).toEqual([]);
  });

  it("reproduit le délai axonal maximal actuel à dt = 1 ms", () => {
    // Littéral, pour la même raison : TOPOLOGIE_DEFAUT.delayMax en dérive désormais.
    const { delayMax, avertissements } = resoudreDelaiMax(DT_DEFAUT);
    expect(delayMax).toBe(8);
    expect(avertissements).toEqual([]);
  });

  it("porte la fenêtre de crédit à sa valeur physiologique", () => {
    // LE changement de fond du lot 0. Le noyau d'origine avait tauElig = 60 ticks, soit un
    // rapport tauElig/tauM de 3 ; la biologie donne 50 à 1000, et ≈ 150 chez l'abeille.
    const { params } = resoudrePlasticite(PLASTICITE_SECONDES, DT_DEFAUT);
    const { params: lif } = resoudreLif(LIF_SECONDES, DT_DEFAUT);
    expect(params.tauElig).toBe(2500);
    expect(params.tauElig / lif.tauM).toBeGreaterThan(50);
    expect(params.tauElig / lif.tauM).toBeLessThan(1000);
  });

  it("re-dérive la cadence dopaminergique depuis la fenêtre de crédit", () => {
    // dumpEvery = 16 ticks serait absurdement fréquent face à une fenêtre de 2500.
    const { params } = resoudrePlasticite(PLASTICITE_SECONDES, DT_DEFAUT);
    expect(params.dumpEvery).toBe(250);
    expect(params.dumpEvery).toBeLessThan(params.tauElig / 5);
  });
});

describe("horloge de débogage à 10 ms", () => {
  it("signale le réfractaire ET le délai axonal, qui tombent sous le tick", () => {
    // C'est la réserve technique de la décision « 10 ms pour le débogage ». lif.ts documente
    // le délai >= 1 comme prérequis NON NÉGOCIABLE de la distinction avant/après.
    const lif = resoudreLif(LIF_SECONDES, 0.01);
    const delai = resoudreDelaiMax(0.01);
    expect(lif.avertissements.join(" ")).toContain("refrac");
    expect(delai.avertissements.join(" ")).toContain("delayMax");
  });

  it("garde la fenêtre de crédit exploitable à 10 ms", () => {
    // Ce qui casse à 10 ms, c'est l'échelle du NEURONE, pas celle du crédit.
    const { params, avertissements } = resoudrePlasticite(PLASTICITE_SECONDES, 0.01);
    expect(params.tauElig).toBe(250);
    expect(avertissements).toEqual([]);
  });

  it("ne rabote rien à 1 ms", () => {
    const tous = [
      ...resoudreLif(LIF_SECONDES, DT_DEFAUT).avertissements,
      ...resoudrePlasticite(PLASTICITE_SECONDES, DT_DEFAUT).avertissements,
      ...resoudreDelaiMax(DT_DEFAUT).avertissements,
    ];
    expect(tous).toEqual([]);
  });

  it("expose le délai maximal en secondes, pas seulement en ticks", () => {
    expect(DELAI_MAX_SECONDES).toBeCloseTo(0.008, 6);
  });
});
