# Myéline — Refonte de l'onglet Théorie en parcours guidé

**Date :** 2026-06-22
**Statut :** design validé (brainstorming) — en attente relecture utilisateur avant plan d'implémentation
**Fichier cible principal :** `src/app/theorie/page.tsx` (+ nouveau dossier `src/components/theorie/`)

## 1. Intention

La page `/theorie` actuelle est soignée mais s'arrête aux **fondamentaux du substrat** (milieu
excitable, criticité, Hebb, développement). Elle ne raconte **pas** le vrai travail scientifique
du projet : les 4 modes, le réservoir, l'apprentissage prouvé de la créature, et les résultats des
tests-sondes (probes).

**Objectif :** transformer la page en un **parcours guidé** « du substrat au comportement » qui
(a) reste **simple à comprendre pour tous**, et (b) **met en valeur le travail accompli** en
affichant les vrais résultats expérimentaux — avec l'honnêteté méthodologique qui est la signature
du projet (distinguer le *garanti* du *observé*, le *réel* de la *scène codée*, le *prouvé* de
l'*ouvert*).

## 2. Décisions verrouillées (issues du cadrage)

| Décision | Choix |
|---|---|
| **Périmètre** | Refonte en **parcours guidé** : chapitres navigables, progression, plus interactif. |
| **Navigation** | **Rail latéral collant + scroll-spy** (5 actes), fine barre de progression ; se replie en puces en haut sur mobile. |
| **Résultats** | Afficher les **vrais chiffres** des probes + cadre d'honnêteté (réel vs scène, garanti vs observé, prouvé vs ouvert). |
| **Accessibilité** | Les **4 leviers** : analogies du quotidien, encadré « En une phrase » par chapitre, glossaire des termes, démos/schémas. |
| **Démos** | Les 3 démos optionnelles sont **dans le périmètre** : mémoire du réservoir, σ interactive, **mini-organisme vivant embarqué**. |

**Non-négociable (garde-fou principal) :** la simplification pédagogique ne doit JAMAIS produire de
surclaim. Voir §6.

## 3. Structure narrative — 5 actes

Tout le contenu actuel est **conservé** (excellent) et réorganisé ; les actes III–V sont **neufs**.
Chaque chapitre porte : un *eyebrow*, un titre, un encadré **« En une phrase »**, une **analogie du
quotidien**, le corps, et (selon) une **démo/schéma**. Les termes techniques sont cliquables → glossaire.

### Acte I — Le substrat *(le matériel mou)*
1. **Du Jeu de la Vie au graphe vivant** *(conservé)*. Analogie : une ville dont les rues se
   reconstruisent. Démo : —.
2. **Un milieu excitable — Greenberg-Hastings** *(conservé)*. Analogie : la *ola* dans un stade
   (debout = excité ; on ne peut pas se relever aussitôt = réfractaire). Démo : `ExcitableStrip` *(réutilisé)*.
3. **Un pas de temps, expliqué** *(conservé)*. Analogie : tout le monde joue en même temps (mise à
   jour synchrone). Démo : `PropagationDemo` *(réutilisé)*.

### Acte II — La vie du réseau *(l'auto-organisation)*
4. **Des avalanches au bord du chaos — criticité** *(conservé + honnêteté + démo)*. Analogie : feu
   de forêt / file de dominos / applaudissements qui s'entretiennent. Note honnête : ici σ est un
   indicateur *illustratif*. Démo : **σ interactive** (sous-critique / critique / super-critique) *(neuf)*.
5. **« Fire together, wire together » — Hebb** *(conservé)*. Analogie : un sentier qui se trace à
   force d'être emprunté.
6. **Une activité qui se construit elle-même — développement** *(conservé)*. Analogie : les vagues
   rétiniennes avant l'ouverture des yeux.

### Acte III — Changer d'échelle
7. **Les mêmes règles, cent mille neurones** *(neuf)*. Analogie : d'un village à une métropole —
   mêmes règles de circulation, autre échelle. Le moteur Échelle (typed-arrays + GPU) fait tourner
   la même dynamique de 1K à 100K+. **Preuve : le mur de séquence** — la STDP rejoue une séquence à
   **100 %**, le Hebb same-tick à **0 %** (carte de résultat).

### Acte IV — Apprendre *(du substrat au comportement — le cœur)*
8. **Le mur du crédit** *(neuf)*. Analogie : récompenser un chien 10 s après le tour — comment
   sait-il quel geste a payé ? Le problème dur : créditer une action pour une récompense *différée*.
   Schéma : **CreditWallDiagram** (frise t → t+4 + trace d'éligibilité) *(neuf)*.
9. **Le réservoir** *(neuf)*. Analogie : un étang — un caillou (entrée) laisse des rides (activité
   riche) qui *persistent* (mémoire) ; on apprend seulement à *lire* les rides. Mécanisme : réseau
   **figé** = mémoire + expansion, seul un **lecteur** linéaire apprend (REINFORCE + trace
   d'éligibilité) → single-layer, on contourne le mur. **Preuve : mémoire 0.93 vs 0.47** (tâche à
   délai, avec contrôle *sans réservoir*) ; **crédit différé λ=0.9 → 0.96 vs λ=0 → 0.50**. Réf :
   Hoerzer, Legenstein & Maass (2014). Schémas : **OrganismLoopDiagram** (partie réservoir+lecteur)
   + démo **mémoire du réservoir** (flash → écho qui persiste) *(neuf)*.
10. **La créature qui apprend** *(neuf)*. Analogie : la boîte de Skinner — appuyer sur le levier B
    (pas C) donne à manger. Par récompense (Hebb même-tick), la créature apprend une *contingence* ;
    le témoin **yoked** prouve que c'est la *contingence* — pas la récompense — qui est apprise.
    **Preuve : Δ̄ appris 1.00 vs yoked 0.00 vs aléatoire 0.00**.
11. **L'organisme incarné** *(neuf)*. Analogie : tout assemblé — un petit animal qui cherche sa
    nourriture. Boucle continue **sentir → réservoir → lecteur → agir → récompense** ; il apprend à
    fourrager. **Preuve : l'apprenant mange bien plus qu'un témoin à politique gelée, et s'améliore.**
    **Honnêteté posée ici même** : le *réel* = activité du réservoir + politique apprise ; le corps
    et la démarche = *scène codée* (cf. commentaire de `ReservoirCreatureView.tsx`). **Caveat
    accolé au schéma** : dans cette tâche la vue est *continue* → le réservoir n'est pas (encore)
    prouvé *nécessaire* au fourrage ; ouverture = « vue intermittente ». Schéma : **OrganismLoopDiagram**
    complet + **mini-organisme vivant** embarqué *(neuf, Phase 2)*.

### Acte V — Le bilan
12. **Ce qu'on a démontré** *(neuf — pièce maîtresse)* : tableau de bord des preuves (§5) +
    encadré **« Ce qui reste ouvert »**.
13. **Des curseurs à la biologie — correspondance** *(conservé, table)*.
14. **Glossaire** *(neuf)*.
15. **Références** *(conservé + ajouts)* : + Hoerzer, Legenstein & Maass (2014) ; Sutton & Barto
    (REINFORCE) ; Wilting & Priesemann (estimateur de branchement) ; Braitenberg, *Vehicles* (1984).

## 4. Couche accessibilité (4 leviers)

- **Encadré « En une phrase »** : un résumé TL;DR ultra-court en tête de chaque chapitre (prop du
  composant `Chapter`).
- **Analogies du quotidien** : une métaphore concrète par concept (voir §3), intégrée au corps.
- **Glossaire** : composant `Glossary` en fin de page + composant inline `GlossaryTerm` qui, au
  survol, montre une définition courte (via `components/ui/tooltip` déjà présent) et, au clic,
  défile jusqu'à l'entrée du glossaire. Remplace l'actuel `Term`.
- **Démos / schémas** : voir §3 et §7.

## 5. Tableau de bord « Ce qu'on a démontré » — données vérifiées à la source

**Principe d'honnêteté du tableau :** chaque carte affiche en titre la **revendication GARANTIE**
(l'assertion `expect`, vraie à *chaque* run sur N graines) et, en pastille, la **valeur OBSERVÉE**
(capturée en *lançant réellement* la probe — jamais codée de mémoire). Cette distinction
garanti/observé est elle-même mise en avant comme la méthode du projet.

Catalogue vérifié (lecture directe des fichiers, 2026-06-22) :

| Capacité | Source (`src/lib/`) | Assertion GARANTIE | Valeur observée (à recapturer en lançant la probe) |
|---|---|---|---|
| La règle apprend (réservoir figé) | `reservoir-gate.probe.test.ts:79-81` — 12 graines | APPRIS ≥ 0.80 ; > YOKED+0.20 ; > ALÉATOIRE+0.20 | ~0.97 (doc spec incarnation) ; yoked/aléat. ≈ 0.5 |
| **Mémoire du réservoir** (tâche à délai) | `reservoir-gate2.probe.test.ts:118-122` — 6 graines | réservoir(délai 4) > 0.65 ; **sans-réservoir(délai 4) < 0.6** ; réservoir(délai 2) > sans+0.20 ; effondrement sous-critique | réservoir **0.93** vs sans **0.47** ; effondrement 0.97→0.57 |
| **Crédit différé** (éligibilité) | `reservoir-gate3.probe.test.ts:79-81` — 8 graines | λ=0.9 (délai 4) > 0.80 ; > (λ=0)+0.25 ; délai 0 > 0.85 | λ=0.9 → **0.96** ; λ=0 → **0.50** |
| **Fourrage incarné** (la politique apprend) | `reservoir-creature.probe.test.ts:40-41` — 6 graines | apprenant **> 1.5×** témoin gelé ; 2e moitié > 1re moitié | apprenant ≈ **31** vs gelé ≈ **2** ; 6.8 → 24.7 |
| **Contingence opérante** (créature) | `creature-gate.probe.test.ts:112-114` — 16 graines | Δ̄ ≥ 0.70 ; > yoked+0.40 ; > aléatoire+0.40 | Δ̄ **1.00** vs **0.00** vs **0.00** |
| **Mur de séquence / STDP** (vrai moteur) | `sequence-stdp-engine.probe.test.ts:102-103` | **STDP replay = 100 %** (`toBe(1)`) ; Hebb < 50 % | STDP **100 %** ; Hebb **0 %** |

Les valeurs observées ci-dessus servent de référence ; à l'implémentation elles seront
**recapturées en lançant `npm test`** et figées dans `src/lib/theorie-results.ts` avec un
commentaire de provenance `fichier:ligne`. Seules les colonnes « GARANTIE » sont présentées comme
« prouvées » ; l'« observé » est étiqueté comme tel.

### Encadré « Ce qui reste ouvert » (honnêteté)

- **L'optimum « la criticité calcule » (pic à σ=1) n'est PAS prouvé.** Seul l'*effondrement
  sous-critique* est asserté — ni bras super-critique, ni pic mesuré à σ=1. `estimateBranching`
  est un estimateur **illustratif** (cf. `criticality.ts:7-10`, qui recommande lui-même les
  exposants d'avalanches ou la méthode de Wilting–Priesemann).
- **La nécessité du réservoir DANS l'incarnation n'est PAS prouvée.** La vue est continue
  (`reservoir-creature.ts:107`) et le contrôle du fourrage est « politique gelée », pas « sans
  réservoir » → le gate prouve que *la politique apprend*, pas que le réservoir est *requis*. (La
  nécessité de la *mémoire* est prouvée séparément dans la tâche-mémoire abstraite, sous-gate 2.)
  Ouverture : la « vue intermittente ».

## 6. Garde-fous d'honnêteté (anti-surclaim)

1. **Garanti vs observé** : tout nombre « prouvé » trace à une assertion `expect` ; les valeurs de
   run sont étiquetées « observé ».
2. **Nécessité du réservoir** : le chapitre 11 et l'`OrganismLoopDiagram` montrent le *mécanisme*
   sans affirmer que le réservoir est *nécessaire au fourrage*. Le caveat « vue continue → nécessité
   ouverte » est **accolé au schéma**, pas relégué au seul encadré de l'Acte V.
3. **Criticité** : partout où σ apparaît (chap. 4, démo σ, tableau de bord), préciser que
   l'estimateur est illustratif et que l'optimum à σ=1 reste ouvert.
4. **Réel vs scène** : pour le mini-organisme et la créature, rappeler que corps/locomotion sont
   codés ; seuls l'activité du réservoir et la politique apprise sont « le réel ».

## 7. Architecture des composants (isolation)

Le `page.tsx` actuel (319 lignes) va grossir → on découpe dans un dossier dédié.

**Nouveau `src/lib/theorie-results.ts`** — données du tableau de bord (un objet par preuve :
`{ id, titre, source, garanti, observe, barres?, note? }`) + items « ce qui reste ouvert ». Source
unique des chiffres, avec provenance en commentaire.

**Nouveau dossier `src/components/theorie/`** :
- `TheoryNav.tsx` — rail collant (5 actes), scroll-spy (IntersectionObserver), barre de
  progression ; repli en puces sur mobile.
- `Chapter.tsx` — enveloppe de section : `id` d'ancrage, eyebrow, titre, encadré « En une phrase ».
- `Glossary.tsx` + `GlossaryTerm` (inline) — remplace `Term`.
- `OrganismLoopDiagram.tsx` — schéma animé sentir→réservoir→lecteur→agir→récompense (framer-motion).
- `CreditWallDiagram.tsx` — frise temporelle + trace d'éligibilité (framer-motion).
- `ProvenResults.tsx` — cartes du tableau de bord (depuis `theorie-results.ts`) + encadré « ouvert ».
- `ReservoirMemoryDemo.tsx` — canvas : flash d'un signal puis blanc, l'écho persiste et décline. *(démo)*
- `SigmaDemo.tsx` — curseur sous-critique / critique / super-critique. *(démo)*
- `LiveOrganism.tsx` — embarque `useReservoirCreature()` + `<ReservoirCreatureView>` + stats
  compactes (`eaten`, `ratePer500`) ; **pause hors écran** via IntersectionObserver. *(démo)*

**`src/app/theorie/page.tsx`** — assemblage du parcours : layout en grille (rail + colonne de
contenu), application du thème, composition des 5 actes.

**Réutilisés tels quels :** `ExcitableStrip`, `PropagationDemo`, `ThemeSwitcher`, `useReservoirCreature`,
`ReservoirCreatureView`, `components/ui/tooltip`, recharts, framer-motion.

## 8. Phasage

Pour livrer de la valeur tôt et isoler le risque (l'embarqué live est le seul « gros lift ») :

- **Phase 1 — le parcours complet et autonome** : rail + scroll-spy, `Chapter` + « En une phrase »
  + analogies (réécriture du contenu en 5 actes), `Glossary`/`GlossaryTerm`, `CreditWallDiagram`,
  `OrganismLoopDiagram`, `ProvenResults` + « ce qui reste ouvert », références. Réutilise les démos
  existantes. **Livrable : une page complète, honnête, accessible** — sans les 3 nouvelles démos.
- **Phase 2 — les 3 démos interactives** : `ReservoirMemoryDemo`, `SigmaDemo`, `LiveOrganism`. Elles
  enrichissent ; la page tient debout sans elles.

Les deux phases sont dans le périmètre (l'utilisateur a demandé les 3 démos) ; le phasage ne fait
qu'ordonner le travail.

## 9. Vérification (critères de succès)

- `npm test` reste **vert** (aucune modification de `src/lib/` de logique ; `theorie-results.ts` ne
  contient que des données). Les valeurs « observé » sont recopiées depuis la sortie console réelle.
- `npm run lint` et `npm run build` passent.
- **Revue manuelle dans l'app** (`npm run dev`) : parcours lisible, rail + scroll-spy fonctionnels,
  reflow mobile correct, rendu cohérent sur les 4 thèmes, démos animées sans fuite (cleanup RAF /
  IntersectionObserver), `LiveOrganism` se met en pause hors écran.
- **Revue d'honnêteté** : chaque revendication « prouvée » mappe à une assertion `expect` ; le caveat
  de nécessité est bien accolé au schéma de la boucle.

## 10. Hors périmètre (non-goals)

- Aucune modification de la **logique des moteurs** (`simulation.ts`, `scale-engine.ts`, `reservoir*`,
  `creature*`).
- **Pas** d'implémentation de la « vue intermittente » (chantier scientifique distinct ; seulement
  mentionnée comme ouverture).
- Pas de nouveau thème.
- Pas de tests de composants React (couche non couverte aujourd'hui ; resterait un chantier séparé).
