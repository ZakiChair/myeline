// Données du tableau de bord « Ce qu'on a démontré ».
// Chiffres VÉRIFIÉS le 2026-06-22 (RNG seedé → déterministe) via :
//   npx vitest run --disableConsoleIntercept src/lib/*.probe.test.ts
// `garanti` = l'assertion expect (vraie à chaque run) ; `observe` = valeur imprimée (reproductible).

export interface BarreComparative {
  label: string;
  value: number;   // largeur 0..1
  caption: string; // valeur affichée
  fort?: boolean;  // barre mise en avant (résultat positif)
}
export interface Preuve {
  id: string;
  titre: string;   // ce qui est démontré, en clair
  acte: string;    // "III" | "IV" | "V" — la voie olfactive est l'acte V
  source: string;  // fichier:ligne de l'assertion
  graines: number;
  garanti: string;
  observe: string;
}
export interface PreuveAvecBarres extends Preuve { barres?: BarreComparative[]; }
export interface Ouverture { id: string; titre: string; detail: string; }

export const PREUVES: PreuveAvecBarres[] = [
  {
    id: "stdp", acte: "III", graines: 1,
    titre: "Apprendre une séquence dans le temps",
    source: "src/lib/sequence-stdp-engine.probe.test.ts:102-103",
    garanti: "La STDP rejoue la séquence à 100 % (assertion exacte) ; le Hebb instantané reste sous 50 %.",
    observe: "STDP 100 % · Hebb 0 % (poids de chaîne 14.0 vs 0.2)",
    barres: [
      { label: "STDP (causale)", value: 1.0, caption: "100 %", fort: true },
      { label: "Hebb (instantané)", value: 0.0, caption: "0 %" },
    ],
  },
  {
    id: "memoire", acte: "IV", graines: 6,
    titre: "Le réservoir tient l'information en mémoire",
    source: "src/lib/reservoir-gate2.probe.test.ts:118-122",
    garanti: "Avec réservoir (délai 4) > 0.65 ; sans réservoir < 0.6 ; la perf s'effondre en régime sous-critique.",
    observe: "réservoir 0.93 vs sans réservoir 0.47 (délai 4) ; effondrement 0.97 → 0.57",
    barres: [
      { label: "avec réservoir", value: 0.93, caption: "0.93", fort: true },
      { label: "sans réservoir", value: 0.47, caption: "0.47" },
    ],
  },
  {
    id: "credit", acte: "IV", graines: 8,
    titre: "Créditer une récompense qui arrive plus tard",
    source: "src/lib/reservoir-gate3.probe.test.ts:79-81",
    garanti: "Avec trace d'éligibilité (λ=0.9, délai 4) > 0.80 et > sans-trace + 0.25.",
    observe: "λ=0.9 → 0.96 vs λ=0 → 0.50",
    barres: [
      { label: "avec trace (λ=0.9)", value: 0.96, caption: "0.96", fort: true },
      { label: "sans trace (λ=0)", value: 0.50, caption: "0.50" },
    ],
  },
  {
    id: "contingence", acte: "IV", graines: 16,
    titre: "Apprendre quelle action paie",
    source: "src/lib/creature-gate.probe.test.ts:112-114",
    garanti: "Δ̄ appris ≥ 0.70 et dépasse yoked et aléatoire de plus de 0.40.",
    observe: "Δ̄ appris 1.00 vs yoked 0.00 vs aléatoire 0.00",
    barres: [
      { label: "appris", value: 1.0, caption: "1.00", fort: true },
      { label: "yoked (reward décorrélé)", value: 0.0, caption: "0.00" },
      { label: "aléatoire", value: 0.0, caption: "0.00" },
    ],
  },
  {
    id: "fourrage", acte: "IV", graines: 6,
    titre: "Un organisme incarné qui apprend à fourrager",
    source: "src/lib/reservoir-creature.probe.test.ts:40-41",
    garanti: "L'apprenant mange plus de 1.5× le témoin à politique gelée, et progresse (2e moitié > 1re).",
    observe: "31.5 vs 2.0 pastilles ; progression 6.8 → 24.7",
    barres: [
      { label: "apprenant", value: 1.0, caption: "31.5", fort: true },
      { label: "politique gelée", value: 2.0 / 31.5, caption: "2.0" },
    ],
  },
  {
    id: "regle", acte: "IV", graines: 12,
    titre: "Le lecteur apprend sur un réservoir figé",
    source: "src/lib/reservoir-gate.probe.test.ts:79-81",
    garanti: "Accuracy apprise ≥ 0.80 et dépasse yoked et aléatoire de plus de 0.20.",
    observe: "0.97 vs yoked 0.46 vs aléatoire 0.50",
    barres: [
      { label: "appris", value: 0.97, caption: "0.97", fort: true },
      { label: "yoked", value: 0.46, caption: "0.46" },
      { label: "aléatoire", value: 0.50, caption: "0.50" },
    ],
  },
  {
    id: "voie-acquisition", acte: "V", graines: 16,
    titre: "La voie olfactive apprend une odeur par contingence",
    source: "src/sim/voie.probe.test.ts",
    garanti: "Apparié 16/16 au dernier essai vs non-apparié 0/16 (Fisher p = 1,66·10⁻⁹) ; inversé et gelé plats.",
    observe: "acquisition 0 → 100 % en 5 essais ; CS seul → réponse apprise",
    barres: [
      { label: "apparié (CS→US)", value: 1.0, caption: "100 %", fort: true },
      { label: "non apparié", value: 0.0, caption: "0 %" },
      { label: "inversé (US→CS)", value: 0.0, caption: "0 %" },
    ],
  },
  {
    id: "voie-generalisation", acte: "V", graines: 32,
    titre: "La mémoire encode la similarité des odeurs",
    source: "src/sim/voie-generalisation.probe.test.ts",
    garanti: "Réponse strictement décroissante avec la distance ; ratio 1C/3C ∈ [1,7 ; 2,9].",
    observe: "100 / 72 / 53 / 25 % puis plancher 13 % — ratio 2,88",
    barres: [
      { label: "odeur conditionnée", value: 1.0, caption: "100 %", fort: true },
      { label: "1C", value: 0.72, caption: "72 %" },
      { label: "2C", value: 0.53, caption: "53 %" },
      { label: "3C", value: 0.25, caption: "25 %" },
      { label: "disjointe", value: 0.13, caption: "13 %" },
    ],
  },
  {
    id: "voie-discrimination", acte: "V", graines: 32,
    titre: "Discrimination A+/B− : la contingence, pas l'odeur",
    source: "src/sim/voie-discrimination.probe.test.ts",
    garanti: "McNemar p < 0,01, contrebalancement symétrique dans les deux groupes.",
    observe: "CS+ 100 % vs CS− 38 % (p = 9,5·10⁻⁷) ; 37,5 % de non-discriminateurs (publié : 31,5 %)",
    barres: [
      { label: "CS+ renforcée", value: 1.0, caption: "100 %", fort: true },
      { label: "CS− jamais renforcée", value: 0.38, caption: "38 %" },
    ],
  },
  {
    id: "voie-dissociation", acte: "V", graines: 16,
    titre: "Deux mémoires de valence opposée, dissociables par lésion",
    source: "src/sim/voie-ser.probe.test.ts",
    garanti: "Lésion OA → PER mort / SER vivant ; lésion DA → l'inverse ; réflexes innés intacts.",
    observe: "double dissociation totale 16/16 ; SER apparié 16/16 vs non apparié 0/16",
    barres: [
      { label: "SER intact / PER intact", value: 1.0, caption: "16/16", fort: true },
      { label: "PER sous lésion OA", value: 0.0, caption: "0/16" },
      { label: "SER sous lésion DA", value: 0.0, caption: "0/16" },
    ],
  },
  {
    id: "voie-monde", acte: "V", graines: 2,
    titre: "L'organisme libre évite la toxine apprise par son odeur",
    source: "src/sim/_voie-monde.probe.test.ts",
    garanti: "Toxine < 0,75× gelé, w(SER|toxine) > 4× w(SER|nourriture), lésions dissociées, reproductible bit-identique.",
    observe: "contacts toxine 166 vs 343 gelé ; inversion ×87–270 ; extinction → niveau naïf",
    barres: [
      { label: "toxine · module actif", value: 166 / 343, caption: "166", fort: true },
      { label: "toxine · module gelé", value: 1.0, caption: "343" },
    ],
  },
];

export const OUVERTURES: Ouverture[] = [
  {
    id: "criticite",
    titre: "L'optimum « la criticité calcule » (pic à σ = 1)",
    detail:
      "On démontre l'effondrement sous-critique, mais pas un pic à σ = 1 (ni bras super-critique). L'estimateur de σ est illustratif (cf. criticality.ts) ; une preuve robuste demande les exposants d'avalanches ou la méthode de Wilting–Priesemann.",
  },
  {
    id: "necessite",
    titre: "La nécessité du réservoir pour le fourrage",
    detail:
      "Dans l'organisme incarné, la vue est continue : le témoin est « politique gelée », pas « sans réservoir ». On prouve donc que la politique apprend, pas que le réservoir est requis ici. La nécessité de la mémoire est prouvée séparément (tâche à délai). Ouverture : la « vue intermittente ».",
  },
];
