# Refonte Théorie en parcours guidé — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Transformer `/theorie` en un parcours guidé « du substrat au comportement » — accessible à tous, mettant en valeur le travail prouvé (résultats des probes) avec honnêteté méthodologique.

**Architecture :** Page éditoriale unique à défilement, avec un rail latéral collant (scroll-spy) sur 5 actes. Contenu découpé en composants isolés dans `src/components/theorie/`, données de résultats centralisées dans `src/lib/theorie-results.ts`. Aucune modification de la logique des moteurs.

**Tech Stack :** Next.js 16 (App Router, `"use client"`), React 19, Tailwind v4, framer-motion (déjà installé), Canvas 2D, `components/ui/tooltip`. Réutilise `useReservoirCreature`, `ReservoirCreatureView`, `ExcitableStrip`, `PropagationDemo`, `ThemeSwitcher`.

**Spec de référence :** `docs/superpowers/specs/2026-06-22-myeline-theorie-parcours-design.md`

## Global Constraints

- **Langue** : tout le contenu et les commentaires en **français** (cf. `CLAUDE.md`).
- **Honnêteté (anti-surclaim)** : tout chiffre « prouvé » trace à une assertion `expect` (colonne *garanti*) ; les valeurs de run sont étiquetées *observé*. Le caveat « vue continue → nécessité du réservoir non prouvée » est **accolé au schéma de la boucle** (Acte IV), pas seulement en Acte V. σ est *illustratif* partout. Corps/locomotion = *scène codée*.
- **Pas de modification** de `src/lib/{simulation,scale-engine,reservoir,reservoir-creature,creature,rules,...}.ts` (logique). `theorie-results.ts` ne contient que des **données**.
- **Thèmes** : tout composant lit ses couleurs depuis le thème courant (`theme.canvas: ThemeCanvas`) ; rendu cohérent sur les 4 thèmes.
- **Tests** : `npm test` doit rester **vert** (86 tests + les nouveaux tests de données/util). Chiffres vérifiés le 2026-06-22 via `npx vitest run --disableConsoleIntercept src/lib/*.probe.test.ts`.

**Approche de test (adaptation assumée) :** la couche React/canvas n'a pas de harnais de test dans ce projet, et le spec exclut explicitement les tests de composants. On applique donc le **TDD là où il y a de la logique pure** (`theorie-results.ts`, helper de scroll-spy) et une **vérification par build + lint + revue visuelle** pour les composants visuels (critères d'acceptation listés par tâche). Cette adaptation est conforme à `CLAUDE.md` (simplicité, modifications chirurgicales) et au spec.

---

## File Structure

**Créés :**
- `src/lib/theorie-results.ts` — données du tableau de bord (preuves + ouvertures). *Données pures, testées.*
- `src/lib/theorie-results.test.ts` — test d'intégrité des données.
- `src/lib/theory-nav.ts` — helper pur de scroll-spy + constante des actes. *Logique pure, testée.*
- `src/lib/theory-nav.test.ts` — test du helper.
- `src/components/theorie/Chapter.tsx` — enveloppe de chapitre (ancre, eyebrow, titre, « En une phrase »).
- `src/components/theorie/Glossary.tsx` — glossaire + `GlossaryTerm` inline (remplace `Term`).
- `src/components/theorie/TheoryNav.tsx` — rail collant + scroll-spy + progression (présentational).
- `src/components/theorie/CreditWallDiagram.tsx` — frise mur du crédit + trace d'éligibilité.
- `src/components/theorie/OrganismLoopDiagram.tsx` — boucle sentir→réservoir→lecteur→agir (+ caveat).
- `src/components/theorie/ProvenResults.tsx` — tableau de bord des preuves + « ce qui reste ouvert ».
- `src/components/theorie/ReservoirMemoryDemo.tsx` — *(Phase 2)* canvas flash→écho.
- `src/components/theorie/SigmaDemo.tsx` — *(Phase 2)* curseur σ.
- `src/components/theorie/LiveOrganism.tsx` — *(Phase 2)* mini-organisme vivant embarqué.

**Modifiés :**
- `src/app/theorie/page.tsx` — réassemblage en parcours (rail + 5 actes), contenu réécrit, suppression du `Section`/`Term` locaux (remplacés par `Chapter`/`GlossaryTerm`).

**Réutilisés tels quels :** `ExcitableStrip`, `PropagationDemo`, `ThemeSwitcher`, `useReservoirCreature`, `ReservoirCreatureView`, `components/ui/tooltip`, `useTheme`, `lib/themes` (`ThemeCanvas`).

---

## PHASE 1 — Le parcours complet et autonome

### Task 1 : Données de résultats vérifiées (`theorie-results.ts`)

**Files:**
- Create: `src/lib/theorie-results.ts`
- Test: `src/lib/theorie-results.test.ts`

**Interfaces:**
- Produces: `interface BarreComparative { label: string; value: number; caption: string; fort?: boolean }`,
  `interface Preuve { id; titre; acte; source; graines; garanti; observe; barres? }`,
  `interface Ouverture { id; titre; detail }`, `export const PREUVES: Preuve[]`, `export const OUVERTURES: Ouverture[]`.

- [ ] **Step 1 : (re)confirmer les chiffres** — lancer :
  `npx vitest run --disableConsoleIntercept src/lib/reservoir-gate.probe.test.ts src/lib/reservoir-gate2.probe.test.ts src/lib/reservoir-gate3.probe.test.ts src/lib/reservoir-creature.probe.test.ts src/lib/creature-gate.probe.test.ts src/lib/sequence-stdp-engine.probe.test.ts`
  Attendu (déterministe) : STDP 100%/Hebb 0% ; mémoire 0.93/0.47 ; λ 0.96/0.50 ; Δ̄ 1.00/0.00/0.00 ; fourrage 31.5/2.0 (6.8→24.7) ; règle 0.97/0.46/0.50. **Si une valeur diffère, utiliser la valeur imprimée.**

- [ ] **Step 2 : écrire le test d'intégrité** (`src/lib/theorie-results.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { PREUVES, OUVERTURES } from "./theorie-results";

describe("theorie-results : intégrité du tableau de bord", () => {
  it("≥ 6 preuves, champs requis présents, barres dans [0,1]", () => {
    expect(PREUVES.length).toBeGreaterThanOrEqual(6);
    for (const p of PREUVES) {
      expect(p.id).toBeTruthy();
      expect(p.titre).toBeTruthy();
      expect(p.source).toMatch(/\.probe\.test\.ts:\d/);
      expect(p.garanti).toBeTruthy();
      expect(p.observe).toBeTruthy();
      for (const b of p.barres ?? []) {
        expect(b.value).toBeGreaterThanOrEqual(0);
        expect(b.value).toBeLessThanOrEqual(1);
        expect(b.caption).toBeTruthy();
      }
    }
  });
  it("ids de preuve uniques", () => {
    const ids = PREUVES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("≥ 2 ouvertures renseignées", () => {
    expect(OUVERTURES.length).toBeGreaterThanOrEqual(2);
    for (const o of OUVERTURES) { expect(o.titre).toBeTruthy(); expect(o.detail).toBeTruthy(); }
  });
});
```

- [ ] **Step 3 : run → échoue** : `npx vitest run src/lib/theorie-results.test.ts` → FAIL (module introuvable).

- [ ] **Step 4 : écrire `src/lib/theorie-results.ts`**

```ts
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
  acte: string;    // "III" | "IV"
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
```

- [ ] **Step 5 : run → passe** : `npx vitest run src/lib/theorie-results.test.ts` → PASS.

- [ ] **Step 6 : commit** : `git add src/lib/theorie-results.ts src/lib/theorie-results.test.ts && git commit -m "feat(theorie): données vérifiées du tableau de bord des preuves"`

---

### Task 2 : Helper de scroll-spy (`theory-nav.ts`)

**Files:**
- Create: `src/lib/theory-nav.ts`
- Test: `src/lib/theory-nav.test.ts`

**Interfaces:**
- Produces: `interface Acte { id: string; label: string; chapitres: { id: string; label: string }[] }`,
  `export const ACTES: Acte[]`, `export function sectionLaPlusVisible(ratios: { id: string; ratio: number }[]): string | null`.

- [ ] **Step 1 : test** (`src/lib/theory-nav.test.ts`)

```ts
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
```

- [ ] **Step 2 : run → échoue** : `npx vitest run src/lib/theory-nav.test.ts` → FAIL.

- [ ] **Step 3 : implémenter `src/lib/theory-nav.ts`**

```ts
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
```

- [ ] **Step 4 : run → passe** : `npx vitest run src/lib/theory-nav.test.ts` → PASS.

- [ ] **Step 5 : commit** : `git add src/lib/theory-nav.ts src/lib/theory-nav.test.ts && git commit -m "feat(theorie): carte des actes + helper scroll-spy"`

---

### Task 3 : Composant `Chapter`

**Files:**
- Create: `src/components/theorie/Chapter.tsx`

**Interfaces:**
- Produces: `export function Chapter({ id, eyebrow, title, enUnePhrase, children }: { id: string; eyebrow: string; title: string; enUnePhrase: string; children: React.ReactNode }): React.JSX.Element`

- [ ] **Step 1 : implémenter** (reprend le style de l'actuel `Section`, + encadré « En une phrase » + ancre `id`)

```tsx
// Enveloppe d'un chapitre du parcours : ancre de scroll-spy, eyebrow, titre, et
// encadré « En une phrase » (TL;DR accessible) avant le corps.

export function Chapter({
  id, eyebrow, title, enUnePhrase, children,
}: {
  id: string; eyebrow: string; title: string; enUnePhrase: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/[0.07] pt-10 mt-14">
      <p className="font-mono text-[11px] tracking-[0.2em] uppercase" style={{ color: "var(--a1)" }}>
        {eyebrow}
      </p>
      <h2 className="mt-3 font-serif text-2xl leading-tight text-white sm:text-3xl">{title}</h2>
      <p
        className="mt-4 rounded-xl border border-white/[0.09] bg-white/[0.02] px-4 py-3 text-[14px] leading-relaxed text-white/80"
        style={{ borderLeftColor: "var(--a1)", borderLeftWidth: 2 }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--a1)" }}>
          En une phrase ·{" "}
        </span>
        {enUnePhrase}
      </p>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-white/70">{children}</div>
    </section>
  );
}
```

- [ ] **Step 2 : vérifier la compilation** : `npx tsc --noEmit` → pas d'erreur dans ce fichier.
- [ ] **Step 3 : commit** : `git add src/components/theorie/Chapter.tsx && git commit -m "feat(theorie): composant Chapter (+ En une phrase)"`

**Acceptation :** le composant rend une section avec ancre, eyebrow, titre, encadré « En une phrase » accentué, puis le corps.

---

### Task 4 : Glossaire (`Glossary` + `GlossaryTerm`)

**Files:**
- Create: `src/components/theorie/Glossary.tsx`

**Interfaces:**
- Consumes: `components/ui/tooltip` (`Tooltip`, `TooltipTrigger`, `TooltipContent` — vérifier les exports réels du fichier avant usage).
- Produces: `export function GlossaryTerm({ termeId, children }: { termeId: string; children: React.ReactNode }): React.JSX.Element`, `export function Glossary(): React.JSX.Element`.

- [ ] **Step 1 : vérifier l'API tooltip** : ouvrir `src/components/ui/tooltip.tsx` et noter les exports (Base UI). Adapter les imports du Step 2 en conséquence.

- [ ] **Step 2 : implémenter** — données `GLOSSAIRE` + terme inline (survol = définition courte ; clic = ancre `#glossaire-{id}`) + section glossaire.

```tsx
"use client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Entree { id: string; terme: string; definition: string }

export const GLOSSAIRE: Entree[] = [
  { id: "criticite", terme: "Criticité (σ ≈ 1)", definition: "Régime où chaque décharge en déclenche en moyenne une autre : l'information se propage le plus loin sans s'éteindre ni exploser." },
  { id: "reservoir", terme: "Réservoir", definition: "Un réseau figé dont l'activité riche sert de mémoire ; seul un « lecteur » linéaire est entraîné." },
  { id: "stdp", terme: "STDP", definition: "Plasticité dépendante de l'ordre des décharges : « avant→après » renforce le lien dans ce sens. Permet d'apprendre des séquences." },
  { id: "eligibilite", terme: "Trace d'éligibilité", definition: "Marque temporaire laissée par une action, qui permet de la créditer quand la récompense arrive plus tard." },
  { id: "hebb", terme: "Hebb", definition: "« Les neurones qui déchargent ensemble se câblent ensemble » : les synapses co-actives se renforcent." },
  { id: "reinforce", terme: "REINFORCE", definition: "Règle d'apprentissage par récompense : on renforce les actions suivies d'une récompense supérieure à la moyenne." },
  { id: "yoked", terme: "Témoin yoked", definition: "Un témoin qui reçoit exactement le même calendrier de récompenses, mais décorrélé de ses actions : il isole l'effet de la contingence." },
];

export function GlossaryTerm({ termeId, children }: { termeId: string; children: React.ReactNode }) {
  const entree = GLOSSAIRE.find((e) => e.id === termeId);
  const inner = (
    <a href={`#glossaire-${termeId}`} className="underline decoration-dotted underline-offset-2"
       style={{ color: "var(--a1)" }}>
      {children}
    </a>
  );
  if (!entree) return inner;
  return (
    <Tooltip>
      <TooltipTrigger render={inner} />
      <TooltipContent>{entree.definition}</TooltipContent>
    </Tooltip>
  );
}

export function Glossary() {
  return (
    <dl className="mt-4 space-y-3">
      {GLOSSAIRE.map((e) => (
        <div key={e.id} id={`glossaire-${e.id}`} className="scroll-mt-24">
          <dt className="font-serif text-white" style={{ color: "var(--a1)" }}>{e.terme}</dt>
          <dd className="text-[15px] leading-relaxed text-white/70">{e.definition}</dd>
        </div>
      ))}
    </dl>
  );
}
```

> Note : `TooltipTrigger render={...}` suit le pattern Base UI ; si l'API du fichier diffère (ex. `asChild`), adapter au Step 1.

- [ ] **Step 3 : vérifier** : `npx tsc --noEmit` → pas d'erreur ; les imports tooltip résolvent.
- [ ] **Step 4 : commit** : `git add src/components/theorie/Glossary.tsx && git commit -m "feat(theorie): glossaire + termes cliquables"`

**Acceptation :** un terme rendu via `GlossaryTerm` montre sa définition au survol et défile vers son entrée au clic ; la section `Glossary` liste toutes les entrées avec ancres.

---

### Task 5 : Rail de navigation (`TheoryNav`)

**Files:**
- Create: `src/components/theorie/TheoryNav.tsx`

**Interfaces:**
- Consumes: `ACTES` (Task 2).
- Produces: `export function TheoryNav({ activeId, progress }: { activeId: string | null; progress: number }): React.JSX.Element` (présentational ; l'observation est gérée par la page, Task 8).

- [ ] **Step 1 : implémenter** — rail collant `<aside>` (caché < lg), liste des actes/chapitres, surlignage de l'`activeId`, barre de progression `progress` (0..1).

```tsx
"use client";
import { ACTES } from "@/lib/theory-nav";

export function TheoryNav({ activeId, progress }: { activeId: string | null; progress: number }) {
  return (
    <aside className="hidden lg:block sticky top-16 h-fit w-56 shrink-0 self-start">
      <nav className="border-l border-white/10 pl-4 text-[13px]">
        {ACTES.map((acte) => (
          <div key={acte.id} className="mb-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">{acte.label}</p>
            <ul className="mt-1 space-y-0.5">
              {acte.chapitres.map((ch) => {
                const actif = ch.id === activeId;
                return (
                  <li key={ch.id}>
                    <a href={`#${ch.id}`}
                       className="block rounded px-2 py-0.5 transition"
                       style={actif
                         ? { color: "var(--a1)", background: "rgba(255,255,255,0.05)" }
                         : { color: "rgba(255,255,255,0.55)" }}>
                      {ch.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-[width]"
               style={{ width: `${Math.round(progress * 100)}%`, background: "var(--a1)" }} />
        </div>
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2 : vérifier** : `npx tsc --noEmit` → OK.
- [ ] **Step 3 : commit** : `git add src/components/theorie/TheoryNav.tsx && git commit -m "feat(theorie): rail de navigation (scroll-spy + progression)"`

**Acceptation :** rail visible ≥ lg, chapitre actif surligné en `--a1`, barre de progression remplie selon `progress`.

---

### Task 6 : Schéma `CreditWallDiagram`

**Files:**
- Create: `src/components/theorie/CreditWallDiagram.tsx`

**Interfaces:**
- Consumes: `ThemeCanvas` (`@/lib/themes`).
- Produces: `export function CreditWallDiagram({ theme }: { theme: ThemeCanvas }): React.JSX.Element`.

- [ ] **Step 1 : implémenter** — frise horizontale de ticks `t … t+4` ; un jeton « action » émis à `t`, une « récompense » à `t+4` ; une barre « trace d'éligibilité » qui décroît de `t` à `t+4` (framer-motion, animation en boucle). SVG responsive `viewBox`.

Structure de référence (les valeurs visuelles sont ajustées contre le rendu) :

```tsx
"use client";
import { motion } from "framer-motion";
import type { ThemeCanvas } from "@/lib/themes";

const TICKS = [0, 1, 2, 3, 4];

export function CreditWallDiagram({ theme }: { theme: ThemeCanvas }) {
  return (
    <figure className="rounded-2xl border border-white/[0.08] bg-black/30 p-5">
      <svg viewBox="0 0 320 120" className="w-full" role="img"
           aria-label="Frise : une action au temps t est créditée par une récompense au temps t+4 grâce à la trace d'éligibilité.">
        {/* axe + ticks */}
        <line x1="20" y1="80" x2="300" y2="80" stroke="rgba(255,255,255,0.2)" />
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={20 + t * 65} y1="76" x2={20 + t * 65} y2="84" stroke="rgba(255,255,255,0.3)" />
            <text x={20 + t * 65} y="98" fill="rgba(255,255,255,0.4)" fontSize="9" textAnchor="middle"
                  fontFamily="monospace">{t === 0 ? "t" : `t+${t}`}</text>
          </g>
        ))}
        {/* trace d'éligibilité (décroît) */}
        <motion.rect x="20" y="50" height="6" rx="3" fill={theme.excited}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: [0, 260, 260], opacity: [0, 0.5, 0.15] }}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 0.6 }} />
        {/* jeton action à t */}
        <motion.circle cy="50" r="6" fill={theme.excitedCore}
          animate={{ cx: [20, 20], opacity: [0, 1, 1, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 0.6 }} />
        {/* récompense à t+4 */}
        <motion.circle cx="280" cy="50" r="7" fill={theme.event}
          animate={{ scale: [0, 0, 1.2, 1], opacity: [0, 0, 1, 1] }}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 0.6 }} />
      </svg>
      <figcaption className="mt-2 text-center font-mono text-[11px] text-white/40">
        l'action (clair) laisse une trace d'éligibilité qui décline ; quand la récompense (coloré)
        arrive en t+4, la trace encore présente crédite l'action.
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 2 : vérifier** : `npx tsc --noEmit` → OK.
- [ ] **Step 3 : commit** : `git add src/components/theorie/CreditWallDiagram.tsx && git commit -m "feat(theorie): schéma du mur du crédit + trace d'éligibilité"`

**Acceptation :** la frise s'anime en boucle ; action en t, récompense en t+4, trace qui décroît ; couleurs issues du thème ; légende présente.

---

### Task 7 : Schéma `OrganismLoopDiagram` (+ caveat nécessité)

**Files:**
- Create: `src/components/theorie/OrganismLoopDiagram.tsx`

**Interfaces:**
- Consumes: `ThemeCanvas`.
- Produces: `export function OrganismLoopDiagram({ theme }: { theme: ThemeCanvas }): React.JSX.Element`.

- [ ] **Step 1 : implémenter** — 4 nœuds en boucle **Sentir → Réservoir → Lecteur → Agir** + flèche de retour « Récompense ». Un jeton anime le parcours (framer-motion `offsetDistance` sur un `path`, ou positions clés). **Sous le schéma, un caveat obligatoire** (garde-fou honnêteté).

```tsx
"use client";
import { motion } from "framer-motion";
import type { ThemeCanvas } from "@/lib/themes";

const NODES = [
  { id: "sentir", label: "Sentir", x: 30, sub: "capteurs" },
  { id: "reservoir", label: "Réservoir", x: 130, sub: "figé · mémoire" },
  { id: "lecteur", label: "Lecteur", x: 230, sub: "appris" },
  { id: "agir", label: "Agir", x: 330, sub: "moteur" },
];

export function OrganismLoopDiagram({ theme }: { theme: ThemeCanvas }) {
  return (
    <figure className="rounded-2xl border border-white/[0.08] bg-black/30 p-5">
      <svg viewBox="0 0 380 150" className="w-full" role="img"
           aria-label="Boucle : sentir, réservoir, lecteur appris, agir, puis récompense en retour.">
        {/* flèches avant */}
        {[0, 1, 2].map((i) => (
          <line key={i} x1={NODES[i].x + 24} y1="50" x2={NODES[i + 1].x - 4} y2="50"
                stroke="rgba(255,255,255,0.25)" markerEnd="url(#tip)" />
        ))}
        {/* retour récompense */}
        <path d="M330 66 q-150 60 -300 0" fill="none" stroke={theme.event}
              strokeDasharray="4 3" markerEnd="url(#tip)" opacity="0.6" />
        <text x="180" y="135" fill={theme.event} fontSize="9" textAnchor="middle" fontFamily="monospace"
              opacity="0.8">récompense</text>
        <defs>
          <marker id="tip" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0 L6 3 L0 6 z" fill="rgba(255,255,255,0.4)" />
          </marker>
        </defs>
        {NODES.map((n, i) => (
          <g key={n.id}>
            <circle cx={n.x} cy="50" r="22"
                    fill={i === 1 ? "rgba(255,255,255,0.04)" : "transparent"}
                    stroke={i === 2 ? theme.excited : "rgba(255,255,255,0.3)"} />
            <text x={n.x} y="48" fill="#fff" fontSize="10" textAnchor="middle" fontFamily="monospace">{n.label}</text>
            <text x={n.x} y="62" fill="rgba(255,255,255,0.4)" fontSize="7.5" textAnchor="middle" fontFamily="monospace">{n.sub}</text>
          </g>
        ))}
        {/* jeton qui circule */}
        <motion.circle r="4" fill={theme.excitedCore}
          animate={{ cx: [30, 130, 230, 330], cy: [50, 50, 50, 50] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
      </svg>
      <figcaption className="mt-2 text-center font-mono text-[11px] text-white/40">
        seul le <span style={{ color: "var(--a1)" }}>lecteur</span> est appris ; le réservoir reste figé.
        le corps et la démarche sont de la <em>scène codée</em>.
      </figcaption>
      <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2 text-[12.5px] text-white/65">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-300/80">À ce stade · </span>
        dans cette tâche la vue est <strong className="text-white/85">continue</strong> : on prouve que la
        politique apprend, pas que le réservoir est <em>nécessaire</em> au fourrage. Rendre la vue
        intermittente (le repère clignote) forcerait la mémoire — c'est l'étape qui reste ouverte.
      </p>
    </figure>
  );
}
```

- [ ] **Step 2 : vérifier** : `npx tsc --noEmit` → OK.
- [ ] **Step 3 : commit** : `git add src/components/theorie/OrganismLoopDiagram.tsx && git commit -m "feat(theorie): schéma boucle Organisme + caveat nécessité"`

**Acceptation :** boucle animée des 4 étapes + retour récompense ; le caveat « vue continue → nécessité non prouvée » est **présent sous le schéma** (garde-fou).

---

### Task 8 : Tableau de bord `ProvenResults`

**Files:**
- Create: `src/components/theorie/ProvenResults.tsx`

**Interfaces:**
- Consumes: `PREUVES`, `OUVERTURES` (Task 1).
- Produces: `export function ProvenResults(): React.JSX.Element`.

- [ ] **Step 1 : implémenter** — une carte par preuve : titre, mini-barres comparatives (largeur `value`, caption), badge « garanti » + ligne « observé », source en mono ; puis l'encadré « Ce qui reste ouvert ».

```tsx
"use client";
import { PREUVES, OUVERTURES } from "@/lib/theorie-results";

export function ProvenResults() {
  return (
    <div className="mt-4 space-y-3">
      {PREUVES.map((p) => (
        <article key={p.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-white">{p.titre}</h3>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-mono"
                  style={{ background: "rgba(118,255,178,0.12)", color: "#76ffb2" }}>GO ✅</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {(p.barres ?? []).map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="w-40 shrink-0 text-white/55">{b.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full rounded-full"
                        style={{ width: `${Math.max(2, b.value * 100)}%`,
                                 background: b.fort ? "var(--a1)" : "rgba(255,255,255,0.25)" }} />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-white/75">{b.caption}</span>
              </div>
            ))}
          </div>
          <dl className="mt-3 grid gap-1 text-[12.5px]">
            <div className="flex gap-2"><dt className="text-white/40 shrink-0">garanti</dt><dd className="text-white/75">{p.garanti}</dd></div>
            <div className="flex gap-2"><dt className="text-white/40 shrink-0">observé</dt><dd className="text-white/60">{p.observe}</dd></div>
          </dl>
          <p className="mt-2 font-mono text-[10.5px] text-white/30">{p.source} · {p.graines} graine{p.graines > 1 ? "s" : ""}</p>
        </article>
      ))}

      <article className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
        <h3 className="font-serif text-white">Ce qui reste ouvert</h3>
        <dl className="mt-2 space-y-2 text-[13px]">
          {OUVERTURES.map((o) => (
            <div key={o.id}>
              <dt className="text-white/85">{o.titre}</dt>
              <dd className="text-white/60">{o.detail}</dd>
            </div>
          ))}
        </dl>
      </article>
    </div>
  );
}
```

- [ ] **Step 2 : vérifier** : `npx tsc --noEmit` → OK.
- [ ] **Step 3 : commit** : `git add src/components/theorie/ProvenResults.tsx && git commit -m "feat(theorie): tableau de bord des preuves (garanti/observé) + ouvertures"`

**Acceptation :** 6 cartes avec barres + garanti/observé + source ; encadré « ce qui reste ouvert » avec les 2 ouvertures.

---

### Task 9 : Réassemblage de `page.tsx` — squelette + Actes I & II

**Files:**
- Modify: `src/app/theorie/page.tsx`

**Interfaces:**
- Consumes: `Chapter`, `TheoryNav`, `GlossaryTerm`/`Glossary`, `useTheme`, `ExcitableStrip`, `PropagationDemo`, `ThemeSwitcher`, `ACTES`/`sectionLaPlusVisible`.

- [ ] **Step 1 : layout + scroll-spy** — passer en grille `rail + contenu`, installer l'IntersectionObserver qui calcule `activeId` (via `sectionLaPlusVisible`) et `progress` (scroll), supprimer `Section`/`Term` locaux. Garde le hero existant + `ExcitableStrip`.

Ossature :

```tsx
"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { ExcitableStrip } from "@/components/ExcitableStrip";
import { PropagationDemo } from "@/components/PropagationDemo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Chapter } from "@/components/theorie/Chapter";
import { TheoryNav } from "@/components/theorie/TheoryNav";
import { GlossaryTerm, Glossary } from "@/components/theorie/Glossary";
import { ACTES, sectionLaPlusVisible } from "@/lib/theory-nav";

export default function TheoriePage() {
  const { themeId, setThemeId, theme } = useTheme();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const ratios = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const ids = ACTES.flatMap((a) => a.chapitres.map((c) => c.id));
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.current.set(e.target.id, e.intersectionRatio);
        setActiveId(sectionLaPlusVisible([...ratios.current].map(([id, ratio]) => ({ id, ratio }))));
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-10% 0px -55% 0px" },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    const onScroll = () => {
      const h = document.documentElement;
      setProgress(h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { obs.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);

  return (
    <div data-theme={themeId} style={theme.vars as React.CSSProperties} className="myeline-bg min-h-screen text-white">
      <div className="mx-auto flex max-w-5xl gap-10 px-6 py-10 sm:py-16">
        <TheoryNav activeId={activeId} progress={progress} />
        <div className="min-w-0 max-w-3xl flex-1">
          {/* barre haut : retour + ThemeSwitcher (inchangée) */}
          {/* hero (conservé) + ExcitableStrip */}
          {/* Chapitres ci-dessous */}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Actes I & II** — convertir les 6 chapitres existants en `<Chapter id=... eyebrow=... title=... enUnePhrase=...>` ; remplacer `<Term>` par `<GlossaryTerm termeId=...>`. Réutiliser `ExcitableStrip` (chap. `excitable`) et `PropagationDemo` (chap. `pas-de-temps`). Textes « En une phrase » :
  - `graphe` : « Des règles locales simples sur un graphe qui se recâble suffisent à engendrer une complexité sans fin. »
  - `excitable` : « Trois états (repos, excité, réfractaire) font naître des ondes au lieu d'une saturation — comme la ola dans un stade. »
  - `pas-de-temps` : « À chaque tick, tous les neurones décident en même temps selon une règle purement locale. »
  - `criticite` : « Le réseau transmet le mieux l'information quand chaque décharge en déclenche à peu près une autre (σ ≈ 1). »
  - `hebb` : « Les synapses co-actives se renforcent, les muettes disparaissent : la fonction sculpte la structure. »
  - `developpement` : « Deux horloges : l'activité (rapide) et le développement (lent) qui fait naître et mourir les neurones. »
  Ajouter une **analogie** par chapitre dans le corps (stade/ola, dominos, sentier dans l'herbe, vagues rétiniennes…). Pour `criticite`, ajouter une phrase honnête : « ici σ est un indicateur illustratif ».

- [ ] **Step 3 : vérifier** : `npx tsc --noEmit && npm run lint` → OK ; `npm run dev`, ouvrir `/theorie` : rail visible, surlignage au défilement, Actes I & II lisibles, démos existantes rendues.
- [ ] **Step 4 : commit** : `git add src/app/theorie/page.tsx && git commit -m "feat(theorie): squelette parcours (rail + scroll-spy) + Actes I & II"`

---

### Task 10 : `page.tsx` — Actes III & IV (le cœur)

**Files:**
- Modify: `src/app/theorie/page.tsx`

- [ ] **Step 1 : Acte III** (`echelle`) — nouveau `Chapter` : analogie village→métropole ; mêmes règles à grande échelle ; mini-renvoi au résultat STDP (« la STDP rejoue une séquence à 100 %, le Hebb instantané à 0 % — détaillé en Acte V »). « En une phrase » : « Les mêmes règles, de mille à cent mille neurones, sur des tableaux typés et le GPU. »

- [ ] **Step 2 : Acte IV** — 4 `Chapter` :
  - `mur-credit` : analogie chien récompensé 10 s trop tard ; insérer `<CreditWallDiagram theme={theme.canvas} />`. « En une phrase » : « Créditer une action pour une récompense qui n'arrive que plusieurs instants plus tard est le vrai problème. »
  - `reservoir` : analogie de l'étang (caillou → rides qui persistent) ; mécanisme (figé = mémoire+expansion, seul le lecteur apprend) ; citer Hoerzer, Legenstein & Maass (2014) ; `<OrganismLoopDiagram theme={theme.canvas} />` (la partie réservoir+lecteur) ; renvoi résultats mémoire/crédit. Termes `<GlossaryTerm>` : réservoir, REINFORCE, éligibilité. « En une phrase » : « Un réseau figé sert de mémoire vivante ; on n'apprend qu'à en lire l'activité. »
  - `creature` : analogie boîte de Skinner ; le témoin yoked prouve la contingence ; renvoi Δ̄ 1.00 vs 0.00. « En une phrase » : « Par récompense, la créature apprend quelle action paie — et un témoin prouve que c'est bien la contingence. »
  - `organisme` : analogie petit animal qui fourrage ; honnêteté réel-vs-scène ; **le caveat nécessité vit déjà dans `OrganismLoopDiagram`** (réutilisé ici en version complète). « En une phrase » : « Sentir → réservoir → agir → récompense, en boucle : l'organisme apprend à se nourrir. »

- [ ] **Step 3 : imports** — ajouter `CreditWallDiagram`, `OrganismLoopDiagram` en tête.
- [ ] **Step 4 : vérifier** : `npx tsc --noEmit && npm run lint` → OK ; revue visuelle `/theorie` : schémas animés rendus, caveat visible sous la boucle.
- [ ] **Step 5 : commit** : `git add src/app/theorie/page.tsx && git commit -m "feat(theorie): Actes III & IV (mur du crédit, réservoir, créature, organisme)"`

---

### Task 11 : `page.tsx` — Acte V (bilan) + références

**Files:**
- Modify: `src/app/theorie/page.tsx`

- [ ] **Step 1 : Acte V** — chapitres :
  - `preuves` : `<ProvenResults />`. « En une phrase » : « Chaque capacité est mesurée ; on distingue ce qui est garanti de ce qui est seulement observé, et ce qui reste ouvert. »
  - `correspondance` : conserver la table « curseurs → biologie » existante (inchangée).
  - `glossaire` : `<Glossary />`.
  - `references` : conserver la liste + **ajouter** : Hoerzer, Legenstein & Maass — *Emergence of complex computational structures from chaotic neural networks through reward-modulated Hebbian learning* (2014) ; Sutton & Barto — *Reinforcement Learning* (REINFORCE) ; Wilting & Priesemann — estimation du ratio de branchement (2018) ; Braitenberg — *Vehicles* (1984).
- [ ] **Step 2 : imports** — ajouter `ProvenResults`, `Glossary`.
- [ ] **Step 3 : vérifier** : `npx tsc --noEmit && npm run lint && npm run build` → OK ; revue `/theorie` complète, rail couvre les 5 actes.
- [ ] **Step 4 : commit** : `git add src/app/theorie/page.tsx && git commit -m "feat(theorie): Acte V (preuves, glossaire, références)"`

---

### Checkpoint Phase 1

- [ ] `npm test` (vert), `npm run lint`, `npm run build` passent.
- [ ] Revue visuelle sur les **4 thèmes** : parcours lisible, rail + scroll-spy OK, reflow mobile (rail caché, contenu pleine largeur).
- [ ] **Revue d'honnêteté** : chaque carte « GO » mappe à une assertion ; caveat nécessité sous la boucle ; σ marqué illustratif.

---

## PHASE 2 — Les 3 démos interactives

### Task 12 : `ReservoirMemoryDemo` (flash → écho)

**Files:**
- Create: `src/components/theorie/ReservoirMemoryDemo.tsx`
- Modify: `src/app/theorie/page.tsx` (insertion dans le chapitre `reservoir`)

**Interfaces:**
- Produces: `export function ReservoirMemoryDemo({ theme }: { theme: ThemeCanvas }): React.JSX.Element`.

- [ ] **Step 1 : implémenter** — canvas 2D : un bouton « flasher » injecte une impulsion ; une rangée de cellules s'allume puis l'**écho décroît** sur quelques frames (trace résiduelle), illustrant la mémoire. Boucle `requestAnimationFrame` avec cleanup (modèle de `ExcitableStrip`). Pas de moteur réel requis : une simple décroissance exponentielle d'un tableau de niveaux suffit (démonstration pédagogique, étiquetée comme telle).
- [ ] **Step 2 : insérer** dans le chapitre `reservoir` : `<ReservoirMemoryDemo theme={theme.canvas} />` + légende « on flashe un signal, puis plus rien : l'écho persiste — c'est la mémoire du réservoir ».
- [ ] **Step 3 : vérifier** : `npx tsc --noEmit && npm run lint` ; revue : le flash laisse une traînée qui s'efface ; cleanup RAF (pas de fuite en quittant la page).
- [ ] **Step 4 : commit** : `git add -A && git commit -m "feat(theorie): démo mémoire du réservoir (flash → écho)"`

**Acceptation :** au clic, impulsion visible puis décroissance ; couleurs du thème ; nettoyage RAF au démontage.

---

### Task 13 : `SigmaDemo` (curseur σ)

**Files:**
- Create: `src/components/theorie/SigmaDemo.tsx`
- Modify: `src/app/theorie/page.tsx` (chapitre `criticite`)

**Interfaces:**
- Produces: `export function SigmaDemo({ theme }: { theme: ThemeCanvas }): React.JSX.Element`.

- [ ] **Step 1 : implémenter** — un `slider` (réutiliser `components/ui/slider`) pilote un paramètre de branchement illustratif ; un petit canvas montre une avalanche qui s'éteint (sous-critique), se propage (≈ critique), ou sature (super-critique). **Honnêteté** : légende « démonstration illustrative — σ n'est pas mesuré ici ». Modèle jouet (branchement de Galton–Watson visuel), pas le moteur réel.
- [ ] **Step 2 : insérer** dans le chapitre `criticite` : `<SigmaDemo theme={theme.canvas} />`.
- [ ] **Step 3 : vérifier** : `npx tsc --noEmit && npm run lint` ; revue : déplacer le curseur change visiblement le régime (éteint / propage / sature) ; légende illustrative présente.
- [ ] **Step 4 : commit** : `git add -A && git commit -m "feat(theorie): démo σ interactive (sous-critique / critique / super-critique)"`

**Acceptation :** 3 régimes distinguables au curseur ; mention explicite « illustratif » (garde-fou criticité).

---

### Task 14 : `LiveOrganism` (mini-organisme vivant embarqué)

**Files:**
- Create: `src/components/theorie/LiveOrganism.tsx`
- Modify: `src/app/theorie/page.tsx` (chapitre `organisme`)

**Interfaces:**
- Consumes: `useReservoirCreature()` → `{ worldRef, stats, running, toggleRun, reset }` ; `ReservoirCreatureView({ worldRef, version, theme })`.
- Produces: `export function LiveOrganism({ theme }: { theme: ThemeCanvas }): React.JSX.Element`.

- [ ] **Step 1 : implémenter** — conteneur dimensionné (`relative h-64`) montant `<ReservoirCreatureView>` + un bandeau de stats compactes (`eaten`, `ratePer500`) + boutons « pause » (toggleRun) et « relancer » (reset). **Pause hors écran** via IntersectionObserver : mettre en pause quand le conteneur n'est pas visible (économie CPU). Réutiliser `version` du hook pour la prop de `ReservoirCreatureView`.

```tsx
"use client";
import { useEffect, useRef } from "react";
import { useReservoirCreature } from "@/hooks/useReservoirCreature";
import { ReservoirCreatureView } from "@/components/ReservoirCreatureView";
import type { ThemeCanvas } from "@/lib/themes";

export function LiveOrganism({ theme }: { theme: ThemeCanvas }) {
  const { worldRef, stats, running, version, toggleRun, reset } = useReservoirCreature();
  const boxRef = useRef<HTMLDivElement>(null);
  const wasRunning = useRef(running);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      const visible = e.isIntersecting;
      if (!visible && running) { wasRunning.current = true; toggleRun(); }
      else if (visible && wasRunning.current && !running) { toggleRun(); }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [running, toggleRun]);

  return (
    <div ref={boxRef} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30">
      <div className="relative h-64"><ReservoirCreatureView worldRef={worldRef} version={version} theme={theme} /></div>
      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-2 font-mono text-[11px] text-white/55">
        <span>mangé : <span className="text-white/85">{stats.eaten}</span> · rythme/500 : <span className="text-white/85">{stats.ratePer500}</span></span>
        <span className="flex gap-2">
          <button onClick={toggleRun} className="rounded border border-white/10 px-2 py-0.5 hover:bg-white/5">{running ? "pause" : "reprendre"}</button>
          <button onClick={reset} className="rounded border border-white/10 px-2 py-0.5 hover:bg-white/5">relancer</button>
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : insérer** dans le chapitre `organisme` : `<LiveOrganism theme={theme.canvas} />` + légende rappelant « le réel = activité du réservoir + politique apprise ; corps = scène ».
- [ ] **Step 3 : vérifier** : `npx tsc --noEmit && npm run lint && npm run build` ; revue : la créature bouge et le compteur « mangé » monte ; pause hors-écran fonctionne ; boutons OK.
- [ ] **Step 4 : commit** : `git add -A && git commit -m "feat(theorie): mini-organisme vivant embarqué (pause hors écran)"`

**Acceptation :** organisme qui fourrage en direct ; stats live ; pause automatique hors écran ; pas de fuite (cleanup hook + observer).

---

## Vérification finale (Task 15)

- [ ] `npm test` → vert (incluant `theorie-results.test.ts`, `theory-nav.test.ts`).
- [ ] `npm run lint` → 0 erreur ; `npm run build` → succès.
- [ ] Revue visuelle `/theorie` sur les **4 thèmes** (Myéline, Immuno, Oscilloscope, Ultraviolet) : cohérence des couleurs, rail + scroll-spy, 3 démos animées, reflow mobile.
- [ ] **Revue d'honnêteté finale** (garde-fous §Global Constraints) : chaque « GO » ↔ assertion ; caveat nécessité sous la boucle ; σ illustratif (démo + texte) ; réel-vs-scène rappelé sur l'organisme.
- [ ] Performances : aucune fuite RAF/observer en quittant la page ; `LiveOrganism` en pause hors écran.
- [ ] Finir la branche via `superpowers:finishing-a-development-branch` (PR ou merge selon le choix de Zaki).

## Self-Review (couverture du spec)

- §3 Actes I–V → Tasks 9, 10, 11. ✅
- §4 Accessibilité (4 leviers) → « En une phrase » (Task 3), analogies (Tasks 9-10), glossaire (Task 4), démos (Tasks 6-7, 12-14). ✅
- §5 Tableau de bord + garanti/observé + ouvertures → Tasks 1, 8. ✅
- §6 Garde-fous → caveat boucle (Task 7), σ illustratif (Tasks 9/13), garanti/observé (Tasks 1/8), réel-vs-scène (Tasks 7/14). ✅
- §7 Composants isolés → Tasks 1-8, 12-14. ✅
- §8 Phasage → Phase 1 (Tasks 1-11), Phase 2 (Tasks 12-14). ✅
- §9 Vérification → Checkpoints + Task 15. ✅
- §10 Hors périmètre → aucune tâche ne touche la logique des moteurs. ✅
