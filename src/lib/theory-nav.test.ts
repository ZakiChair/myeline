import { describe, it, expect } from "vitest";
import { sectionLaPlusVisible, ACTES } from "./theory-nav";

describe("sectionLaPlusVisible", () => {
  it("retourne l'id au ratio max", () => {
    expect(sectionLaPlusVisible([{ id: "a", ratio: 0.2 }, { id: "b", ratio: 0.8 }])).toBe("b");
  });
  it("égalité → première rencontrée", () => {
    expect(sectionLaPlusVisible([{ id: "a", ratio: 0.5 }, { id: "b", ratio: 0.5 }])).toBe("a");
  });
  it("aucune visible → null", () => {
    expect(sectionLaPlusVisible([{ id: "a", ratio: 0 }, { id: "b", ratio: 0 }])).toBeNull();
  });
});

describe("ACTES", () => {
  it("définit 5 actes avec ids de chapitres uniques", () => {
    expect(ACTES.length).toBe(5);
    const ids = ACTES.flatMap((a) => a.chapitres.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
