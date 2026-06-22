// Carte de navigation du parcours Théorie + helper de scroll-spy (logique pure, testable).

export interface Acte {
  id: string;
  label: string;
  chapitres: { id: string; label: string }[];
}

export const ACTES: Acte[] = [
  { id: "acte-1", label: "I · Le substrat", chapitres: [
    { id: "graphe", label: "Du Jeu de la Vie au graphe" },
    { id: "excitable", label: "Un milieu excitable" },
    { id: "pas-de-temps", label: "Un pas de temps" },
  ]},
  { id: "acte-2", label: "II · La vie du réseau", chapitres: [
    { id: "criticite", label: "Au bord du chaos" },
    { id: "hebb", label: "Fire together, wire together" },
    { id: "developpement", label: "Le développement" },
  ]},
  { id: "acte-3", label: "III · Changer d'échelle", chapitres: [
    { id: "echelle", label: "Cent mille neurones" },
  ]},
  { id: "acte-4", label: "IV · Apprendre", chapitres: [
    { id: "mur-credit", label: "Le mur du crédit" },
    { id: "reservoir", label: "Le réservoir" },
    { id: "creature", label: "La créature qui apprend" },
    { id: "organisme", label: "L'organisme incarné" },
  ]},
  { id: "acte-5", label: "V · Le bilan", chapitres: [
    { id: "preuves", label: "Ce qu'on a démontré" },
    { id: "correspondance", label: "Des curseurs à la biologie" },
    { id: "glossaire", label: "Glossaire" },
    { id: "references", label: "Références" },
  ]},
];

/** Section active = celle au ratio de visibilité maximal (égalité → première ; aucune visible → null). */
export function sectionLaPlusVisible(ratios: { id: string; ratio: number }[]): string | null {
  let best: { id: string; ratio: number } | null = null;
  for (const r of ratios) if (!best || r.ratio > best.ratio) best = r;
  return best && best.ratio > 0 ? best.id : null;
}
