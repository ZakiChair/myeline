# Myéline « Vie » — Lot 1 : noyau vivant (plan d'implémentation)

> **Pour les agents exécutants :** SOUS-COMPÉTENCE REQUISE — `superpowers:executing-plans`
> pour dérouler ce plan tâche par tâche. Les étapes utilisent la syntaxe case à cocher
> (`- [ ]`) pour le suivi. **Exécution inline** (pas de sous-agent implémenteur).

**But :** construire `src/sim/`, le noyau pur et déterministe d'un organisme dont le cerveau
(réseau LIF à plasticité à trois facteurs) est la *cause* de son comportement de survie, et
prouver en test qu'il apprend.

**Architecture :** sept modules purs sans DOM (`topology`, `lif`, `plasticity`, `world`,
`brain`, `organism`, `metrics`), en typed-arrays SoA + CSR bidirectionnel, dans la lignée de
`src/lib/scale-engine.ts`. Aucun module existant n'est modifié : le parcours `/theorie` reste
intact. Le lot s'arrête à la preuve headless — worker, rendu et protocoles témoins sont les
lots 2 et 3.

**Pile technique :** TypeScript strict, vitest 4 (`npm test`), `mulberry32` de
`src/lib/rng.ts`, aucune dépendance nouvelle.

**Conception de référence :** `docs/superpowers/specs/2026-07-30-myeline-vie-design.md`
(commit `70cf6a2`). En cas de contradiction, la conception fait foi ; signaler l'écart plutôt
que de l'absorber en silence.

## Contraintes globales

Ces règles s'appliquent à **toutes** les tâches, sans être répétées à chaque fois.

- **Français.** Commentaires, noms de tests (`describe`/`it`) et messages de commit en
  français. Les identifiants de code restent en anglais quand le domaine l'impose
  (`spike`, `elig`, `postTrace`) — c'est déjà la convention de `src/lib/`.
- **Le tick est l'unité de temps.** `dt = 1 tick`. Toutes les constantes temporelles (τm, τs,
  τthr, τe, délais axonaux, métabolisme) s'expriment en ticks. **On n'affirme aucune
  correspondance en secondes**, ni dans le code, ni dans les commentaires, ni dans la doc.
  Un « taux de décharge » est donc en décharges/tick ; quand une cible « ≈ 5 Hz » de la
  conception est visée, elle se traduit en `TAUX_CIBLE` décharges/tick, valeur fixée par
  mesure (tâche 3), pas par conversion.
- **N est un paramètre.** Le littéral `50000` n'apparaît **jamais** dans `src/sim/`. Toutes
  les tailles de région se dérivent de `n` (voir tâche 1). Les tests unitaires tournent à
  `n` ≈ 2 000–4 000 pour que `npm test` reste utilisable.
- **Déterminisme.** Tout module de `src/sim/` est pur : même graine ⇒ même trajectoire, bit
  à bit. Aucun `Math.random()`, aucune `Date`, aucun état module-global mutable. Le RNG est
  toujours passé en argument (`RNG` de `src/lib/rng.ts`). Seule exception admise :
  `performance.now()` dans le banc de débit de la tâche 8, qui ne pilote aucune décision de
  simulation et ne sert qu'à journaliser une durée.
- **Séparation test court / test long.** `*.test.ts` = unitaire, < 2 s chacun.
  `*.probe.test.ts` = expérience longue (calibration, apprentissage), avec un `timeout`
  explicite passé à `it()`. C'est la convention déjà en place dans `src/lib/`.
- **Aucun chiffre avant d'avoir été mesuré.** Interdiction d'écrire un seuil d'assertion
  (taux de décharge cible, facteur d'amélioration de durée de vie, ratio toxine) tiré d'une
  intuition. Le protocole est toujours : *lancer, observer, journaliser la valeur observée,
  puis seulement figer le seuil dans le test et dans le document*. Les tâches 3 et 9 sont
  construites autour de cette règle.
- **Loi de Dale.** Un neurone ne change jamais de signe. La plasticité s'applique
  **uniquement aux arêtes dont la source est excitatrice** ; les poids inhibiteurs sont fixés
  à la construction. Cela préserve le signe sans clamp acrobatique et halve le travail du
  balayage dopaminergique.
- **Commits fréquents.** Un commit par tâche minimum, préfixe `feat(vie):` /
  `test(vie):` / `fix(vie):`. Chaque commit laisse `npm test` vert.
- **Pas de Next.js dans ce lot.** `src/sim/` est du TypeScript pur. La règle de `AGENTS.md`
  (lire `node_modules/next/dist/docs/` avant d'écrire du code Next) ne s'applique qu'aux lots
  2 et 4.

## Structure des fichiers

| Fichier | Responsabilité | Ne fait pas |
|---|---|---|
| `src/sim/params.ts` | types de configuration + valeurs par défaut, un seul endroit pour les constantes | aucune logique |
| `src/sim/topology.ts` | régions, dalle corticale, CSR sortant **et** entrant, poids initiaux, signes | aucune dynamique |
| `src/sim/lif.ts` | état des neurones, un tick d'activité, tampon circulaire des délais, masque de lésion | plasticité, monde |
| `src/sim/plasticity.ts` | traces pré/post, éligibilité paresseuse, règle à trois facteurs, homéostasie | décide de la dopamine |
| `src/sim/world.ts` | arène, nourriture, toxine, prédateur, énergie, mort, sensations, récompense | connaît le cerveau |
| `src/sim/brain.ts` | assemblage topologie+LIF+plasticité, encodage capteurs, décodage moteur par course au seuil | connaît le monde |
| `src/sim/organism.ts` | boucle fermée sentir → cerveau → décider → agir → doper ; dopamine injectable ; journal d'événements | rend quoi que ce soit |
| `src/sim/metrics.ts` | durées de vie, compteurs comportementaux, résumés par moitié d'expérience | assertions |

`params.ts` est un ajout par rapport à la liste de fichiers de la conception (§7) : sans lui,
chaque module réexporterait les types de ses voisins et les valeurs par défaut se
disperseraient. Il ne contient **aucune logique** — uniquement des types et des constantes.
`metrics.ts` importe `WorldEventKind` depuis `world.ts` ; c'est sa seule dépendance.

`brain.ts` ne connaît pas `world.ts` et réciproquement : ils communiquent par les types
`Sensation` et `MotorAction` définis dans `params.ts`. C'est ce qui rendra le lot 3 possible
sans chirurgie (témoin yoked = on remplace la source de dopamine ; lésion = on remplace le
masque de neurones éteints).

## Coutures verrouillées pour le lot 3

Ces décisions sont prises **maintenant** parce que les protocoles du lot 3 en dépendent, même
si leur implémentation appartient au lot 3.

1. **Dopamine injectable.** `organism.ts` n'appelle jamais un calcul de dopamine en dur : il
   consulte `options.dopamineSource`, dont le défaut est `r - rBar`. Le témoin *yoked*
   (protocole 3) fournit une fonction qui rejoue un calendrier enregistré. Le témoin *gelé*
   (protocole 2) passe `lr: 0`.
2. **Journal d'événements avec décharges.** `organism.ts` appelle `options.onEvent(ev)` à
   chaque événement du monde, `ev` portant la liste des neurones ayant déchargé au tick
   courant. Le protocole 4 (lésion) construit lui-même sa corrélation activité↔toxine à
   partir de ce flux ; le lot 1 n'embarque aucune machinerie de corrélation.
3. **Masque de silence.** `LifState.silenced: Uint8Array | null` est lu par `stepLif`. Le
   lot 1 le laisse à `null` et teste seulement qu'un neurone masqué ne décharge pas ; le
   protocole 4 le remplit.

---

## Tâche 1 : paramètres et topologie

**Fichiers :**
- Créer : `src/sim/params.ts`
- Créer : `src/sim/topology.ts`
- Test : `src/sim/topology.test.ts`

**Interfaces :**
- Consomme : `RNG`, `mulberry32`, `randInt` de `src/lib/rng.ts`.
- Produit :
  ```ts
  // params.ts
  export type RegionId =
    | "OLF_FOOD" | "OLF_TOXIN" | "ALARM" | "SOMA" | "INTERO"
    | "CORTEX" | "MOTOR" | "VTA";

  export interface Region {
    id: RegionId;
    start: number;      // premier indice de neurone
    count: number;      // nombre de neurones
    pools: number;      // nombre de sous-pools (secteurs)
    poolSize: number;   // count === pools * poolSize (sauf CORTEX : pools = 1)
  }

  export interface TopologyParams {
    n: number;          // taille totale visée
    seed: number;
    kCortex: number;    // sorties par neurone cortical
    kSensory: number;   // sorties par neurone sensoriel (vers le cortex)
    kMotorIn: number;   // entrées par neurone moteur (tirées du cortex)
    sigmaExc: number;   // portée gaussienne des projections excitatrices (en mailles)
    sigmaInh: number;   // portée gaussienne des projections inhibitrices (> sigmaExc)
    fracInh: number;    // fraction d'inhibiteurs corticaux
    delayMax: number;   // délai axonal maximal, en ticks (>= 1)
    wExc: number;       // poids initial excitateur
    wInh: number;       // poids initial inhibiteur (valeur positive ; le signe est appliqué)
    wMax: number;       // borne supérieure du module d'un poids
  }

  export const TOPOLOGIE_DEFAUT: TopologyParams;

  // topology.ts
  export interface Topology {
    n: number;
    e: number;
    regions: Region[];
    regionOf: Uint8Array;   // [n] → indice dans regions
    sign: Int8Array;        // [n] +1 / -1
    posX: Float32Array;     // [n] coordonnées de dalle (cortex) ou d'anneau (périphérie)
    posY: Float32Array;
    posZ: Float32Array;
    // CSR sortant
    outOffsets: Int32Array; // [n+1]
    outTarget: Int32Array;  // [e]
    outDelay: Uint8Array;   // [e] dans [1, delayMax]
    // CSR entrant (partage w via inEdge)
    inOffsets: Int32Array;  // [n+1]
    inSource: Int32Array;   // [e]
    inEdge: Int32Array;     // [e] → indice dans w
    w: Float32Array;        // [e] indexé dans l'ordre du CSR sortant
  }

  export function buildTopology(p: TopologyParams): Topology;
  /** Lève si la région n'existe pas — une faute de frappe doit tomber tout de suite. */
  export function regionById(topo: Topology, id: RegionId): Region;
  export function poolRange(r: Region, pool: number): { start: number; end: number };
  ```

**Dimensionnement des régions (dérivé de `n`, jamais écrit en dur).** La conception donne les
tailles à N = 50 000. On conserve le **nombre de pools** (structure : 24 secteurs
olfactifs, 16 secteurs d'alarme, 4 pools moteurs…) et on met à l'échelle la **taille de
pool** par le rapport `n / 50000`, avec un plancher de 2 neurones par pool :

```ts
const REF_N = 50_000;
const DISPOSITION: Array<{ id: RegionId; pools: number; poolSizeRef: number }> = [
  { id: "OLF_FOOD",  pools: 24, poolSizeRef:  60 },
  { id: "OLF_TOXIN", pools: 24, poolSizeRef:  60 },
  { id: "ALARM",     pools: 16, poolSizeRef:  50 },
  { id: "SOMA",      pools:  8, poolSizeRef:  40 },
  { id: "INTERO",    pools: 12, poolSizeRef:  40 },
  { id: "MOTOR",     pools:  4, poolSizeRef: 500 },
  { id: "VTA",       pools:  1, poolSizeRef:  20 },
];
// poolSize = max(2, round(poolSizeRef * n / REF_N)) ; CORTEX = n - somme(le reste).
```

À `n = 50000` on retrouve exactement le tableau de la conception ; à `n = 3000` le cortex
reste largement majoritaire (~2 400 neurones), ce qui garde les tests représentatifs.

**Câblage.** Le cortex occupe une **dalle cubique torique** de côté
`L = ceil(cbrt(nCortex))` : chaque neurone cortical a des coordonnées entières `(x, y, z)` et
tire ses `kCortex` cibles en échantillonnant des décalages `(dx, dy, dz)` gaussiens
(σ = `sigmaExc` si la source est excitatrice, `sigmaInh` si elle est inhibitrice), avec
enroulement torique. Le tore est un choix assumé : il donne à tous les neurones le même degré
et supprime les effets de bord, ce qui rend le taux de décharge homogène — condition pour que
la calibration de la tâche 3 signifie quelque chose.

Chaque région périphérique a une **ancre** dans la dalle (points bien séparés, dérivés
déterministement de l'indice de région) : les neurones sensoriels projettent `kSensory`
arêtes dans une boule gaussienne autour de l'ancre de leur région, décalée par leur numéro de
pool — deux secteurs voisins arrivent donc dans des territoires voisins mais distincts.
Chaque neurone moteur tire `kMotorIn` sources corticales autour de l'ancre de son pool. Les
neurones moteurs et VTA n'ont **aucune arête sortante** (feuilles) : la compétition entre
pools moteurs est portée par les accumulateurs de `brain.ts`, pas par des synapses. Aucun
câblage capteur→moteur direct, conformément à la conception.

**Génération ordonnée par source.** On émet les arêtes en parcourant les sources dans l'ordre
croissant : le CSR sortant se construit sans tri. Le CSR entrant se construit ensuite par
comptage en deux passes classiques.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/sim/topology.test.ts
import { describe, it, expect } from "vitest";
import { buildTopology, regionById, poolRange } from "./topology";
import { TOPOLOGIE_DEFAUT } from "./params";

const p = (over = {}) => ({ ...TOPOLOGIE_DEFAUT, n: 3000, seed: 7, ...over });

describe("buildTopology", () => {
  it("répartit exactement n neurones entre les régions, sans trou ni chevauchement", () => {
    const t = buildTopology(p());
    expect(t.regions.reduce((s, r) => s + r.count, 0)).toBe(t.n);
    let attendu = 0;
    for (const r of t.regions) {
      expect(r.start).toBe(attendu);
      if (r.id !== "CORTEX") expect(r.count).toBe(r.pools * r.poolSize);
      attendu += r.count;
    }
    expect(attendu).toBe(3000);
  });

  it("donne au cortex la majorité des neurones", () => {
    const t = buildTopology(p());
    expect(regionById(t, "CORTEX").count).toBeGreaterThan(t.n / 2);
  });

  it("respecte la loi de Dale : signe fixe, part d'inhibiteurs corticaux conforme", () => {
    const t = buildTopology(p());
    const ctx = regionById(t, "CORTEX");
    let inh = 0;
    for (let i = ctx.start; i < ctx.start + ctx.count; i++) {
      expect(t.sign[i] === 1 || t.sign[i] === -1).toBe(true);
      if (t.sign[i] === -1) inh++;
    }
    const part = inh / ctx.count;
    expect(part).toBeGreaterThan(TOPOLOGIE_DEFAUT.fracInh - 0.03);
    expect(part).toBeLessThan(TOPOLOGIE_DEFAUT.fracInh + 0.03);
  });

  it("aligne le signe du poids sur le signe du neurone source", () => {
    const t = buildTopology(p());
    for (let i = 0; i < t.n; i++) {
      for (let k = t.outOffsets[i]; k < t.outOffsets[i + 1]; k++) {
        if (t.sign[i] === 1) expect(t.w[k]).toBeGreaterThan(0);
        else expect(t.w[k]).toBeLessThan(0);
        expect(Math.abs(t.w[k])).toBeLessThanOrEqual(TOPOLOGIE_DEFAUT.wMax);
      }
    }
  });

  it("construit un CSR entrant cohérent avec le CSR sortant", () => {
    const t = buildTopology(p());
    expect(t.inOffsets[t.n]).toBe(t.e);
    // chaque arête entrante pointe vers l'arête sortante correspondante
    const vues = new Set<number>();
    for (let j = 0; j < t.n; j++) {
      for (let k = t.inOffsets[j]; k < t.inOffsets[j + 1]; k++) {
        const e = t.inEdge[k];
        expect(vues.has(e)).toBe(false);
        vues.add(e);
        expect(t.outTarget[e]).toBe(j);       // l'arête vise bien j
        const src = t.inSource[k];
        expect(e).toBeGreaterThanOrEqual(t.outOffsets[src]);
        expect(e).toBeLessThan(t.outOffsets[src + 1]); // et part bien de src
      }
    }
    expect(vues.size).toBe(t.e);
  });

  it("place les délais axonaux dans [1, delayMax] et interdit les boucles sur soi", () => {
    const t = buildTopology(p());
    for (let e = 0; e < t.e; e++) {
      expect(t.outDelay[e]).toBeGreaterThanOrEqual(1);
      expect(t.outDelay[e]).toBeLessThanOrEqual(TOPOLOGIE_DEFAUT.delayMax);
    }
    for (let i = 0; i < t.n; i++) {
      for (let k = t.outOffsets[i]; k < t.outOffsets[i + 1]; k++) {
        expect(t.outTarget[k]).not.toBe(i);
      }
    }
  });

  it("ne câble jamais un capteur directement sur un pool moteur", () => {
    const t = buildTopology(p());
    const mot = regionById(t, "MOTOR");
    for (const id of ["OLF_FOOD", "OLF_TOXIN", "ALARM", "SOMA", "INTERO"] as const) {
      const r = regionById(t, id);
      for (let i = r.start; i < r.start + r.count; i++) {
        for (let k = t.outOffsets[i]; k < t.outOffsets[i + 1]; k++) {
          const cible = t.outTarget[k];
          expect(cible >= mot.start && cible < mot.start + mot.count).toBe(false);
        }
      }
    }
  });

  it("laisse les pools moteurs et la VTA sans arête sortante", () => {
    const t = buildTopology(p());
    for (const id of ["MOTOR", "VTA"] as const) {
      const r = regionById(t, id);
      for (let i = r.start; i < r.start + r.count; i++) {
        expect(t.outOffsets[i + 1] - t.outOffsets[i]).toBe(0);
      }
    }
  });

  it("donne aux pools moteurs des entrées corticales", () => {
    const t = buildTopology(p());
    const mot = regionById(t, "MOTOR");
    for (let j = mot.start; j < mot.start + mot.count; j++) {
      expect(t.inOffsets[j + 1] - t.inOffsets[j]).toBeGreaterThan(0);
    }
  });

  it("est déterministe pour une même graine et différente pour une autre", () => {
    const a = buildTopology(p({ seed: 42 }));
    const b = buildTopology(p({ seed: 42 }));
    const c = buildTopology(p({ seed: 43 }));
    expect(Array.from(a.outTarget)).toEqual(Array.from(b.outTarget));
    expect(Array.from(a.w)).toEqual(Array.from(b.w));
    expect(Array.from(a.outTarget)).not.toEqual(Array.from(c.outTarget));
  });

  it("expose les bornes d'un pool", () => {
    const t = buildTopology(p());
    const olf = regionById(t, "OLF_FOOD");
    const r0 = poolRange(olf, 0);
    const r1 = poolRange(olf, 1);
    expect(r0.end).toBe(r1.start);
    expect(r0.end - r0.start).toBe(olf.poolSize);
  });
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Commande : `npx vitest run src/sim/topology.test.ts`
Attendu : ÉCHEC — « Failed to resolve import "./topology" ».

- [ ] **Étape 3 : écrire `src/sim/params.ts`**

Y placer `RegionId`, `Region`, `TopologyParams`, `TOPOLOGIE_DEFAUT`, ainsi que les types
partagés entre monde et cerveau (`Sensation`, `MotorAction`) qui serviront aux tâches 4 et 5 :

```ts
// Types et valeurs par défaut partagés par tout le noyau « Vie ».
// Le tick est l'unité de temps : toutes les constantes temporelles sont en ticks.

export type MotorAction = "GAUCHE" | "DROITE" | "AVANCER" | "STOP";
export const ACTIONS: readonly MotorAction[] = ["GAUCHE", "DROITE", "AVANCER", "STOP"];

/** Ce que l'organisme perçoit à un tick. Intensités dans [0, 1]. */
export interface Sensation {
  food: Float32Array;   // [24] par secteur de cap
  toxin: Float32Array;  // [24]
  alarm: Float32Array;  // [16]
  soma: Float32Array;   // [8]
  energy: number;       // [0, 1] fraction de l'énergie maximale
}

export const TOPOLOGIE_DEFAUT: TopologyParams = {
  n: 50_000, seed: 1,
  kCortex: 64, kSensory: 24, kMotorIn: 48,
  sigmaExc: 2.2, sigmaInh: 4.4, fracInh: 0.2,
  delayMax: 8,
  wExc: 0.09, wInh: 0.28, wMax: 1.5,
};
```

Les valeurs de `wExc`/`wInh`/`sigmaExc` ci-dessus sont un **point de départ**, pas un
résultat : la tâche 3 les corrigera par mesure et le commit correspondant les mettra à jour.

- [ ] **Étape 4 : écrire `src/sim/topology.ts`**

Squelette imposé (les parties délicates sont données en entier ; le reste est du remplissage
direct) :

```ts
// Topologie du cerveau « Vie » : régions, dalle corticale torique, CSR bidirectionnel.
// Pur et déterministe : même graine ⇒ même câblage.

import { mulberry32, randInt, type RNG } from "@/lib/rng";
import type { Region, RegionId, TopologyParams } from "./params";

/** Tirage gaussien centré réduit (Box–Muller), déterministe via le RNG fourni. */
function gauss(rng: RNG): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Décalage entier gaussien non nul, borné à ±L/2 (la dalle est torique). */
function offsetGaussien(rng: RNG, sigma: number, l: number): number {
  const d = Math.round(gauss(rng) * sigma);
  const borne = Math.floor(l / 2);
  return Math.max(-borne, Math.min(borne, d));
}
```

Le corps de `buildTopology` suit cet ordre, sans exception :

1. Découper les régions (`DISPOSITION` + reste au cortex), remplir `regionOf`.
2. Poser les positions : cortex sur la dalle `L³` (`idx → (x, y, z)` par division
   euclidienne) ; régions périphériques sur un anneau autour de la dalle, à titre purement
   décoratif pour le lot 2 — elles ne servent pas au câblage.
3. Tirer les signes : `fracInh` d'inhibiteurs **dans le cortex uniquement** ; capteurs,
   moteurs et VTA excitateurs.
4. **Première passe** : pour chaque source `i` dans l'ordre croissant, compter ses arêtes
   sortantes → `outOffsets` par somme préfixe. Le nombre est connu d'avance (`kCortex`,
   `kSensory`, ou 0), sauf pour les entrées motrices : celles-ci sont tirées par le neurone
   *moteur*, donc il faut d'abord tirer, pour chaque neurone moteur `j`, ses `kMotorIn`
   sources corticales, et ajouter +1 au compte de chacune. Faire ce tirage **avant** la somme
   préfixe et le mémoriser dans un tableau temporaire `motorSrc: Int32Array[MOTOR.count * kMotorIn]`
   réutilisé à la deuxième passe (le RNG n'est pas rejoué, donc pas de divergence possible).
5. **Deuxième passe** : remplir `outTarget`, `outDelay`, `w` en respectant `outOffsets`.
   Délai : `randInt(rng, 1, delayMax)`. Poids : `sign[i] === 1 ? wExc : -wInh`.
6. Construire le CSR entrant : compter les cibles (`inOffsets` par somme préfixe), puis pour
   chaque arête `e` de source `i` et cible `j`, écrire `inSource[k] = i`, `inEdge[k] = e`.
7. Vérifier `outOffsets[n] === e === inOffsets[n]` par une assertion interne
   (`if (...) throw new Error(...)`) — un CSR incohérent doit tomber à la construction, pas
   dix mille ticks plus tard.

Éviter les boucles sur soi par re-tirage (au plus 8 essais, puis on saute l'arête et on
réduit le degré : la somme préfixe étant déjà figée, remplir alors la case avec une cible
tirée uniformément hors de `i`).

- [ ] **Étape 5 : lancer les tests et vérifier qu'ils passent**

Commande : `npx vitest run src/sim/topology.test.ts`
Attendu : SUCCÈS, 11 tests.

- [ ] **Étape 6 : vérifier le budget mémoire à pleine échelle**

Commande :
```bash
npx vitest run src/sim/topology.test.ts --reporter=verbose
node --input-type=module -e "
  const { buildTopology } = await import('./src/sim/topology.ts');
" 2>/dev/null || true
```
Plus simplement, ajouter un test `*.probe.test.ts` temporaire ou une exécution `tsx` qui
construit `n = 50000` et journalise `topo.e`, la mémoire attendue
(`e * 4 * 3 / 2**20` Mo pour `w` + `outTarget` + `inEdge`) et la durée de construction.
**Journaliser les valeurs observées dans le message de commit.** Si la construction dépasse
5 s ou 300 Mo, s'arrêter et le signaler plutôt que d'optimiser à l'aveugle.

- [ ] **Étape 7 : commit**

```bash
git add src/sim/params.ts src/sim/topology.ts src/sim/topology.test.ts
git commit -m "feat(vie): topologie CSR bidirectionnelle, régions et dalle corticale torique"
```

---

## Tâche 2 : neurone LIF et tick d'activité

**Fichiers :**
- Créer : `src/sim/lif.ts`
- Modifier : `src/sim/params.ts` (ajout de `LifParams` et `LIF_DEFAUT`)
- Test : `src/sim/lif.test.ts`

**Interfaces :**
- Consomme : `Topology` (tâche 1), `RNG`.
- Produit :
  ```ts
  export interface LifParams {
    tauM: number;      // constante de fuite membranaire, en ticks
    tauS: number;      // fuite du courant synaptique, en ticks
    tauThr: number;    // retour du seuil vers thrBase, en ticks
    vRest: number;
    vReset: number;
    thrBase: number;
    thrJump: number;   // saut de seuil après décharge (frein anti-monopole)
    refrac: number;    // ticks de réfractaire
    noise: number;     // écart-type du bruit de courant par tick
  }

  export interface LifState {
    n: number;
    v: Float32Array;
    thr: Float32Array;
    iSyn: Float32Array;
    inject: Float32Array;    // courant externe imposé par les capteurs (remis à 0 chaque tick)
    refracLeft: Uint8Array;
    spikes: Int32Array;      // liste des neurones ayant déchargé au tick courant
    spikeCount: number;      // nombre d'entrées valides dans `spikes`
    fired: Uint8Array;       // [n] 0/1 au tick courant, pour un test O(1)
    spikeTotal: Int32Array;  // [n] compteur cumulé, remis à zéro par l'homéostasie
    ring: Float32Array;      // [D * n] tampon circulaire des livraisons différées
    ringDepth: number;       // D = delayMax + 1
    silenced: Uint8Array | null; // masque de lésion (lot 3) ; null = aucun
    t: number;
  }

  export function createLif(topo: Topology, p: LifParams): LifState;
  export function stepLif(topo: Topology, st: LifState, p: LifParams, rng: RNG): number;
  export function meanRate(st: LifState, ticks: number): number; // décharges / (neurone · tick)
  ```

**Ordre du tick, non négociable** (une inversion change la dynamique) :

1. Consommer `ring[(t % D) * n .. +n]` dans `iSyn` après fuite :
   `iSyn[i] = iSyn[i] * exp(-1/tauS) + ring[base + i] + inject[i]`, puis remettre la tranche
   du ring et `inject` à zéro.
2. Pour chaque neurone non réfractaire et non masqué :
   `v[i] += (-(v[i] - vRest) / tauM + iSyn[i] + noise * gauss(rng))`.
   Les réfractaires décrémentent `refracLeft[i]` et gardent `v[i] = vReset`.
3. Seuil : `v[i] >= thr[i]` → décharge (`fired`, `spikes`, `spikeTotal`), `v[i] = vReset`,
   `refracLeft[i] = refrac`, `thr[i] += thrJump`.
4. Relaxation du seuil : `thr[i] += (thrBase - thr[i]) / tauThr` **pour tous**.
5. Propagation : pour chaque décharge `i`, pour chaque arête sortante `e` :
   `ring[(((t + outDelay[e]) % D) * n) + outTarget[e]] += w[e]`.
6. `t++`.

Le délai minimal étant 1, une décharge du tick `t` ne peut jamais être consommée au tick `t`
— c'est ce qui rend « avant » et « après » distinguables, prérequis de la STDP.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/sim/lif.test.ts
import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/rng";
import { buildTopology } from "./topology";
import { createLif, stepLif, meanRate } from "./lif";
import { LIF_DEFAUT, TOPOLOGIE_DEFAUT } from "./params";

const topo = () => buildTopology({ ...TOPOLOGIE_DEFAUT, n: 2000, seed: 3 });
const lifP = (over = {}) => ({ ...LIF_DEFAUT, noise: 0, ...over });

describe("stepLif", () => {
  it("ne fait décharger personne sans entrée ni bruit", () => {
    const t = topo();
    const st = createLif(t, lifP());
    for (let k = 0; k < 50; k++) expect(stepLif(t, st, lifP(), mulberry32(1))).toBe(0);
  });

  it("décharge quand le courant injecté franchit le seuil, puis reste réfractaire", () => {
    const t = topo();
    const p = lifP({ refrac: 4 });
    const st = createLif(t, p);
    st.inject[0] = 10; // largement au-dessus du seuil
    expect(stepLif(t, st, p, mulberry32(1))).toBeGreaterThanOrEqual(1);
    expect(st.fired[0]).toBe(1);
    expect(st.refracLeft[0]).toBe(4);
    // pendant le réfractaire, même une injection forte ne redéclenche pas
    for (let k = 0; k < 4; k++) {
      st.inject[0] = 10;
      stepLif(t, st, p, mulberry32(1));
      expect(st.fired[0]).toBe(0);
    }
  });

  it("élève le seuil après une décharge puis le laisse redescendre vers thrBase", () => {
    const t = topo();
    const p = lifP({ tauThr: 20 });
    const st = createLif(t, p);
    st.inject[0] = 10;
    stepLif(t, st, p, mulberry32(1));
    const apres = st.thr[0];
    expect(apres).toBeGreaterThan(p.thrBase);
    for (let k = 0; k < 200; k++) stepLif(t, st, p, mulberry32(1));
    expect(st.thr[0]).toBeLessThan(apres);
    expect(st.thr[0]).toBeCloseTo(p.thrBase, 2);
  });

  it("respecte le délai axonal : la cible ne reçoit rien avant le délai de l'arête", () => {
    const t = topo();
    const p = lifP();
    const st = createLif(t, p);
    // on choisit une source corticale et on relève le délai minimal de ses sorties
    const src = 0;
    let dMin = 255;
    for (let e = t.outOffsets[src]; e < t.outOffsets[src + 1]; e++) {
      dMin = Math.min(dMin, t.outDelay[e]);
    }
    st.inject[src] = 10;
    stepLif(t, st, p, mulberry32(1)); // décharge au tick 0
    // avant dMin ticks supplémentaires, aucun courant n'a pu être livré
    let recu = 0;
    for (let k = 1; k < dMin; k++) {
      stepLif(t, st, p, mulberry32(1));
      for (let i = 0; i < st.n; i++) recu += Math.abs(st.iSyn[i]);
    }
    expect(recu).toBe(0);
    stepLif(t, st, p, mulberry32(1)); // tick dMin : la livraison arrive
    let apres = 0;
    for (let i = 0; i < st.n; i++) apres += Math.abs(st.iSyn[i]);
    expect(apres).toBeGreaterThan(0);
  });

  it("n'attribue jamais de courant à la source elle-même au tick de sa décharge", () => {
    const t = topo();
    const p = lifP();
    const st = createLif(t, p);
    st.inject[0] = 10;
    stepLif(t, st, p, mulberry32(1));
    expect(st.iSyn[0]).toBe(0);
  });

  it("ne fait jamais décharger un neurone masqué (lésion)", () => {
    const t = topo();
    const p = lifP();
    const st = createLif(t, p);
    st.silenced = new Uint8Array(st.n);
    st.silenced[0] = 1;
    for (let k = 0; k < 20; k++) {
      st.inject[0] = 10;
      stepLif(t, st, p, mulberry32(1));
      expect(st.fired[0]).toBe(0);
    }
  });

  it("est déterministe pour une même graine, y compris avec du bruit", () => {
    const t = topo();
    const p = lifP({ noise: 0.05 });
    const run = () => {
      const st = createLif(t, p);
      const rng = mulberry32(11);
      const trace: number[] = [];
      for (let k = 0; k < 100; k++) trace.push(stepLif(t, st, p, rng));
      return trace;
    };
    expect(run()).toEqual(run());
  });

  it("compte les décharges cumulées par neurone", () => {
    const t = topo();
    const p = lifP({ refrac: 1 });
    const st = createLif(t, p);
    for (let k = 0; k < 10; k++) {
      st.inject[0] = 10;
      stepLif(t, st, p, mulberry32(1));
    }
    expect(st.spikeTotal[0]).toBeGreaterThan(1);
    expect(meanRate(st, 10)).toBeGreaterThan(0);
  });
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Commande : `npx vitest run src/sim/lif.test.ts`
Attendu : ÉCHEC — « Failed to resolve import "./lif" ».

- [ ] **Étape 3 : ajouter `LifParams` / `LIF_DEFAUT` dans `params.ts`**

```ts
export const LIF_DEFAUT: LifParams = {
  tauM: 20, tauS: 5, tauThr: 120,
  vRest: 0, vReset: 0, thrBase: 1, thrJump: 0.18,
  refrac: 3, noise: 0.02,
};
```

Là encore : point de départ, corrigé par la tâche 3.

- [ ] **Étape 4 : écrire `src/sim/lif.ts`**

Implémenter strictement l'ordre du tick ci-dessus. Précalculer `Math.exp(-1 / tauS)` et
`1 / tauM` hors boucle. `spikes` est dimensionné à `n` (borne haute) et `spikeCount` est
remis à 0 en début de tick ; `fired` est remis à zéro **uniquement pour les indices de
`spikes` du tick précédent** (pas de `fill` sur `n` à chaque tick).

- [ ] **Étape 5 : lancer les tests et vérifier qu'ils passent**

Commande : `npx vitest run src/sim/lif.test.ts`
Attendu : SUCCÈS, 8 tests.

- [ ] **Étape 6 : commit**

```bash
git add src/sim/lif.ts src/sim/lif.test.ts src/sim/params.ts
git commit -m "feat(vie): neurone LIF à seuil adaptatif, délais axonaux et masque de lésion"
```

---

## Tâche 3 : calibration du régime (porte mesurée, avant toute plasticité)

**Fichiers :**
- Créer : `src/sim/calibration.probe.test.ts`
- Modifier : `src/sim/params.ts` (valeurs corrigées par la mesure)
- Créer : `docs/superpowers/notes/2026-07-30-vie-calibration.md`

**Interfaces :**
- Consomme : `buildTopology`, `createLif`, `stepLif`, `meanRate`.
- Produit, exportés depuis `params.ts` :
  ```ts
  /** Taux de décharge du régime calibré, en décharges par neurone et par tick. */
  export const TAUX_CIBLE: number;
  /** Courant de fond retenu à la calibration, réutilisé par les sondes. */
  export const DRIVE_CALIBRE: number;
  ```
  **La tâche 4 (homéostasie) dépend de `TAUX_CIBLE`.** Les deux valeurs sont écrites à
  l'étape 3, à partir de la mesure — ne pas les pré-remplir à l'étape 1.

Cette tâche est une **porte** : le lot ne continue pas tant que le réseau ne tient pas un
régime stable. C'est la mitigation nommée dans le tableau des risques de la conception
(« le réseau ne converge pas »). Aucune plasticité, aucune récompense n'est branchée ici.

- [ ] **Étape 1 : écrire le banc de mesure (pas encore d'assertion chiffrée)**

```ts
// src/sim/calibration.probe.test.ts
// Sonde de calibration : on cherche le régime où le réseau ne s'éteint pas et ne s'emballe
// pas, SANS plasticité. Les seuils de ce fichier sont issus de la mesure (étape 3), jamais
// d'une intuition.
import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/rng";
import { buildTopology } from "./topology";
import { createLif, stepLif } from "./lif";
import { LIF_DEFAUT, TOPOLOGIE_DEFAUT } from "./params";

/** Fait tourner le réseau avec une excitation de fond et renvoie le profil de taux par fenêtre. */
function profil(n: number, seed: number, ticks: number, drive: number) {
  const topo = buildTopology({ ...TOPOLOGIE_DEFAUT, n, seed });
  const st = createLif(topo, LIF_DEFAUT);
  const rng = mulberry32(seed ^ 0x5eed);
  const FEN = 200;
  const taux: number[] = [];
  let cumul = 0;
  for (let k = 0; k < ticks; k++) {
    // excitation de fond : courant constant sur une fraction des neurones corticaux
    for (let i = 0; i < st.n; i += 17) st.inject[i] = drive;
    cumul += stepLif(topo, st, LIF_DEFAUT, rng);
    if ((k + 1) % FEN === 0) {
      taux.push(cumul / (FEN * st.n));
      cumul = 0;
    }
  }
  return taux;
}

describe("calibration du régime (sans plasticité)", () => {
  it("journalise le profil de taux pour plusieurs excitations", () => {
    for (const drive of [0.02, 0.05, 0.1, 0.2]) {
      const taux = profil(3000, 5, 3000, drive);
      const moyen = taux.reduce((a, b) => a + b, 0) / taux.length;
      const fin = taux.slice(-3).reduce((a, b) => a + b, 0) / 3;
      // eslint-disable-next-line no-console
      console.log(`drive=${drive} moyen=${moyen.toFixed(5)} fin=${fin.toFixed(5)} profil=[${taux.map((x) => x.toFixed(4)).join(", ")}]`);
    }
    expect(true).toBe(true); // banc de mesure : aucune assertion à cette étape
  }, 120_000);
});
```

- [ ] **Étape 2 : lancer la sonde et lire les chiffres**

Commande : `npx vitest run src/sim/calibration.probe.test.ts --reporter=verbose`
Attendu : SUCCÈS, avec quatre lignes `drive=…` dans la sortie. Ne rien conclure d'autre à
cette étape que : quelles valeurs de `drive`, `wExc`, `wInh`, `thrJump` donnent un profil
**plat et non nul**.

- [ ] **Étape 3 : régler jusqu'à obtenir un régime viable**

Boucle de réglage, dans cet ordre de priorité (changer un paramètre à la fois) :
1. Si le taux s'effondre à 0 → augmenter `wExc`, ou `drive`, ou baisser `thrBase`.
2. Si le taux explose (profil croissant, > 0,05 décharge/neurone/tick) → augmenter `wInh`,
   `thrJump`, ou `fracInh`.
3. Si le profil oscille fortement → augmenter `tauThr`.

Reporter les valeurs retenues dans `TOPOLOGIE_DEFAUT` / `LIF_DEFAUT` et **écrire la mesure
finale** dans `docs/superpowers/notes/2026-07-30-vie-calibration.md` : paramètres, taux moyen
observé par fenêtre, écart-type inter-fenêtres, et le `drive` retenu. Ce fichier est la
source de vérité de la ligne « régime » ; il sera cité par la doc du lot 4.

- [ ] **Étape 4 : figer la porte avec les valeurs mesurées**

Remplacer le test-banc par le test-porte, en **reportant les nombres observés** (les `___`
ci-dessous ne sont pas des placeholders à laisser : ils sont remplis à l'étape 3, sinon la
tâche n'est pas finie) :

```ts
import { TAUX_CIBLE, DRIVE_CALIBRE } from "./params";

it("tient un régime stable, ni éteint ni emballé, sur 3000 ticks", () => {
  const taux = profil(3000, 5, 3000, DRIVE_CALIBRE);
  const debut = taux.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const fin = taux.slice(-3).reduce((a, b) => a + b, 0) / 3;
  // bornes issues de la mesure du 2026-07-30 (voir notes/2026-07-30-vie-calibration.md)
  expect(fin).toBeGreaterThan(TAUX_CIBLE * 0.4);   // pas d'extinction
  expect(fin).toBeLessThan(TAUX_CIBLE * 2.5);      // pas d'emballement
  expect(Math.abs(fin - debut)).toBeLessThan(TAUX_CIBLE * 0.8); // profil plat
}, 120_000);

it("garde le même régime à une autre graine", () => {
  const taux = profil(3000, 99, 3000, DRIVE_CALIBRE);
  const fin = taux.slice(-3).reduce((a, b) => a + b, 0) / 3;
  expect(fin).toBeGreaterThan(TAUX_CIBLE * 0.4);
  expect(fin).toBeLessThan(TAUX_CIBLE * 2.5);
}, 120_000);

it("garde le même régime à n plus grand", () => {
  const taux = profil(12_000, 5, 2000, DRIVE_CALIBRE);
  const fin = taux.slice(-3).reduce((a, b) => a + b, 0) / 3;
  expect(fin).toBeGreaterThan(TAUX_CIBLE * 0.3);
  expect(fin).toBeLessThan(TAUX_CIBLE * 3);
}, 180_000);
```

Le troisième test est essentiel : si le régime dépend de `n`, la mise à l'échelle vers
50 000 neurones échouera au lot 2, et il vaut mieux le savoir maintenant.

- [ ] **Étape 5 : lancer la porte**

Commande : `npx vitest run src/sim/calibration.probe.test.ts`
Attendu : SUCCÈS, 3 tests. **Si la porte ne passe pas après réglage, s'arrêter et le
signaler** — ne pas continuer vers la tâche 4 avec un réseau instable, ne pas relâcher les
bornes pour faire passer le test.

- [ ] **Étape 6 : commit**

```bash
git add src/sim/calibration.probe.test.ts src/sim/params.ts docs/superpowers/notes/2026-07-30-vie-calibration.md
git commit -m "test(vie): porte de calibration du régime — taux mesuré et bornes issues de la mesure"
```

---

## Tâche 4 : plasticité à trois facteurs et homéostasie

**Fichiers :**
- Créer : `src/sim/plasticity.ts`
- Modifier : `src/sim/params.ts` (`PlasticityParams`, `PLASTICITE_DEFAUT`)
- Test : `src/sim/plasticity.test.ts`

**Interfaces :**
- Consomme : `Topology`, `LifState`.
- Produit :
  ```ts
  export interface PlasticityParams {
    tauPre: number;      // décroissance des traces de décharge, en ticks
    tauPost: number;
    tauElig: number;     // décroissance de l'éligibilité, en ticks
    aPlus: number;       // amplitude LTP
    aMinus: number;      // amplitude LTD
    lr: number;          // taux d'apprentissage (0 = témoin gelé)
    dumpEvery: number;   // cadence du déversement dopaminergique, en ticks
    dumpNow: number;     // |da| au-delà duquel on déverse immédiatement
    homeoEvery: number;  // cadence de l'homéostasie, en ticks
    homeoRate: number;   // vigueur de la mise à l'échelle (petit)
    homeoClamp: number;  // borne du facteur multiplicatif par passage (ex. 0.05 → [0.95, 1.05])
    wMax: number;        // doit valoir TopologyParams.wMax ; createBrain le vérifie et lève sinon
  }

  export interface PlasticityState {
    preTrace: Float32Array;   // [n]
    postTrace: Float32Array;  // [n]
    elig: Float32Array;       // [e]
    lastTouch: Int32Array;    // [e] tick du dernier accès
    lut: Float32Array;        // table de décroissance de l'éligibilité, saturée à 0
    daAccum: number;          // dopamine accumulée depuis le dernier déversement
    lastDump: number;
  }

  export function createPlasticity(topo: Topology, p: PlasticityParams): PlasticityState;
  /** Met à jour les traces et l'éligibilité à partir des décharges du tick. */
  export function accumulateEligibility(
    topo: Topology, lif: LifState, ps: PlasticityState, p: PlasticityParams,
  ): void;
  /** Ajoute de la dopamine ; déverse si la cadence ou le seuil l'impose. Renvoie true si déversé. */
  export function addDopamine(
    topo: Topology, lif: LifState, ps: PlasticityState, p: PlasticityParams, da: number,
  ): boolean;
  /** Mise à l'échelle multiplicative des poids entrants excitateurs vers TAUX_CIBLE. */
  export function homeostasis(
    topo: Topology, lif: LifState, p: PlasticityParams, tauxCible: number,
  ): void;
  ```

**Décision tranchée sur la décroissance paresseuse** (la conception la laissait implicite) :
le déversement dopaminergique **balaye toutes les arêtes, applique la mise à jour, et
réinitialise `lastTouch[e] = t`**. Conséquence directe : l'âge d'une trace ne dépasse jamais
`dumpEvery` ticks, donc la LUT n'a jamais besoin d'indices plus grands. On la dimensionne
malgré tout à `4 * tauElig` (quelques centaines d'entrées, mémoire négligeable) pour rester
correct si un déversement hors cadence survient, et on sature à 0 au-delà. Le
« on ne paie que les arêtes actives » de la conception décrit donc le travail **entre** deux
déversements, pas le balayage lui-même.

Formule d'accès à une arête (unique point d'entrée, à ne pas dupliquer) :

```ts
/** Décroît l'éligibilité jusqu'au tick courant, puis renvoie sa valeur à jour. */
function touch(ps: PlasticityState, e: number, t: number): number {
  const age = t - ps.lastTouch[e];
  const f = age >= ps.lut.length ? 0 : ps.lut[age];
  ps.elig[e] *= f;
  ps.lastTouch[e] = t;
  return ps.elig[e];
}
```

Règle, appliquée **uniquement si la source est excitatrice** (`topo.sign[i] === 1`) :

```
décharge de i → pour chaque sortie e = i→j : touch(e); elig[e] -= aMinus * postTrace[j]  (LTD)
décharge de j → pour chaque entrée e = i→j : touch(e); elig[e] += aPlus  * preTrace[i]   (LTP)
déversement   → pour chaque e : w[e] += lr * da * touch(e); clamp(w[e], 0, wMax); elig[e] = 0
```

Les traces sont mises à jour **après** les deux boucles ci-dessus (`preTrace[i] += 1` pour
chaque décharge, puis décroissance globale de toutes les traces) : sinon la trace d'un
neurone se compterait elle-même et la LTD dégénérerait en anti-Hebb sur un seul tick.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/sim/plasticity.test.ts
import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/rng";
import { buildTopology } from "./topology";
import { createLif, stepLif } from "./lif";
import { createPlasticity, accumulateEligibility, addDopamine, homeostasis } from "./plasticity";
import { LIF_DEFAUT, PLASTICITE_DEFAUT, TOPOLOGIE_DEFAUT, TAUX_CIBLE } from "./params";

const monter = (n = 2000, seed = 3) => {
  const topo = buildTopology({ ...TOPOLOGIE_DEFAUT, n, seed });
  const lif = createLif(topo, LIF_DEFAUT);
  const ps = createPlasticity(topo, PLASTICITE_DEFAUT);
  return { topo, lif, ps };
};

describe("éligibilité", () => {
  it("reste nulle tant que rien ne décharge", () => {
    const { topo, lif, ps } = monter();
    for (let k = 0; k < 20; k++) {
      stepLif(topo, lif, { ...LIF_DEFAUT, noise: 0 }, mulberry32(1));
      accumulateEligibility(topo, lif, ps, PLASTICITE_DEFAUT);
    }
    let somme = 0;
    for (let e = 0; e < topo.e; e++) somme += Math.abs(ps.elig[e]);
    expect(somme).toBe(0);
  });

  it("devient non nulle après une coïncidence pré→post", () => {
    const { topo, lif, ps } = monter();
    const p = { ...LIF_DEFAUT, noise: 0 };
    // on force une source excitatrice puis sa cible, à quelques ticks d'écart
    let src = -1;
    for (let i = 0; i < topo.n && src < 0; i++) {
      if (topo.sign[i] === 1 && topo.outOffsets[i + 1] > topo.outOffsets[i]) src = i;
    }
    const e0 = topo.outOffsets[src];
    const cible = topo.outTarget[e0];
    lif.inject[src] = 10;
    stepLif(topo, lif, p, mulberry32(1));
    accumulateEligibility(topo, lif, ps, PLASTICITE_DEFAUT);
    for (let k = 0; k < 3; k++) {
      lif.inject[cible] = 10;
      stepLif(topo, lif, p, mulberry32(1));
      accumulateEligibility(topo, lif, ps, PLASTICITE_DEFAUT);
    }
    expect(ps.elig[e0]).toBeGreaterThan(0); // LTP : la source a précédé la cible
  });

  it("décroît avec le temps et s'annule au-delà de 4·tauElig", () => {
    const { topo, lif, ps } = monter();
    ps.elig[0] = 1;
    ps.lastTouch[0] = 0;
    lif.t = PLASTICITE_DEFAUT.tauElig; // un tau plus tard
    addDopamine(topo, lif, ps, { ...PLASTICITE_DEFAUT, lr: 0 }, 0); // force un touch sans modifier w
    // après un tau, il reste environ 1/e
    expect(ps.elig[0]).toBe(0); // le déversement remet à zéro : on vérifie plutôt la LUT
    expect(ps.lut[PLASTICITE_DEFAUT.tauElig]).toBeCloseTo(Math.exp(-1), 3);
    expect(ps.lut[ps.lut.length - 1]).toBe(0);
  });
});

describe("dopamine", () => {
  it("ne modifie aucun poids sans dopamine", () => {
    const { topo, lif, ps } = monter();
    const avant = Float32Array.from(topo.w);
    for (let k = 0; k < 100; k++) {
      for (let i = 0; i < lif.n; i += 17) lif.inject[i] = 0.2;
      stepLif(topo, lif, LIF_DEFAUT, mulberry32(1));
      accumulateEligibility(topo, lif, ps, PLASTICITE_DEFAUT);
      addDopamine(topo, lif, ps, PLASTICITE_DEFAUT, 0);
    }
    expect(Array.from(topo.w)).toEqual(Array.from(avant));
  });

  it("renforce les arêtes éligibles avec une dopamine positive et les affaiblit avec une négative", () => {
    for (const [da, sens] of [[1, 1], [-1, -1]] as const) {
      const { topo, lif, ps } = monter();
      const e0 = topo.outOffsets[0];
      // on ne teste que si le neurone 0 est excitateur ; sinon on prend le premier excitateur
      let src = 0;
      while (topo.sign[src] !== 1) src++;
      const e = topo.outOffsets[src];
      ps.elig[e] = 0.5;
      ps.lastTouch[e] = lif.t;
      const avant = topo.w[e];
      addDopamine(topo, lif, ps, { ...PLASTICITE_DEFAUT, dumpNow: 0.5 }, da);
      if (sens > 0) expect(topo.w[e]).toBeGreaterThan(avant);
      else expect(topo.w[e]).toBeLessThan(avant);
      expect(topo.w[e]).toBeGreaterThanOrEqual(0);            // le signe de Dale est préservé
      expect(topo.w[e]).toBeLessThanOrEqual(PLASTICITE_DEFAUT.wMax);
    }
  });

  it("ne modifie rien quand lr = 0 (témoin gelé)", () => {
    const { topo, lif, ps } = monter();
    let src = 0;
    while (topo.sign[src] !== 1) src++;
    const e = topo.outOffsets[src];
    ps.elig[e] = 0.5;
    ps.lastTouch[e] = lif.t;
    const avant = topo.w[e];
    addDopamine(topo, lif, ps, { ...PLASTICITE_DEFAUT, lr: 0, dumpNow: 0.5 }, 1);
    expect(topo.w[e]).toBe(avant);
  });

  it("laisse les poids inhibiteurs intacts", () => {
    const { topo, lif, ps } = monter();
    let inh = 0;
    while (topo.sign[inh] !== -1) inh++;
    const e = topo.outOffsets[inh];
    ps.elig[e] = 0.5;
    ps.lastTouch[e] = lif.t;
    const avant = topo.w[e];
    addDopamine(topo, lif, ps, { ...PLASTICITE_DEFAUT, dumpNow: 0.5 }, 1);
    expect(topo.w[e]).toBe(avant);
  });

  it("déverse à la cadence prévue et remet lastTouch à jour partout", () => {
    const { topo, lif, ps } = monter();
    const p = { ...PLASTICITE_DEFAUT, dumpEvery: 4, dumpNow: 99 };
    let deverse = 0;
    for (let k = 0; k < 12; k++) {
      lif.t = k;
      if (addDopamine(topo, lif, ps, p, 0.01)) deverse++;
    }
    expect(deverse).toBe(3);
    for (let e = 0; e < topo.e; e++) expect(lif.t - ps.lastTouch[e]).toBeLessThanOrEqual(p.dumpEvery);
  });
});

describe("homéostasie", () => {
  it("réduit les poids entrants d'un neurone trop actif et augmente ceux d'un neurone trop calme", () => {
    const { topo, lif } = monter();
    const p = PLASTICITE_DEFAUT;
    const cible = 500; // un neurone cortical quelconque
    const somme = (j: number) => {
      let s = 0;
      for (let k = topo.inOffsets[j]; k < topo.inOffsets[j + 1]; k++) {
        const e = topo.inEdge[k];
        if (topo.w[e] > 0) s += topo.w[e];
      }
      return s;
    };
    lif.spikeTotal[cible] = Math.round(TAUX_CIBLE * p.homeoEvery * 10); // dix fois trop actif
    const avant = somme(cible);
    homeostasis(topo, lif, p, TAUX_CIBLE);
    expect(somme(cible)).toBeLessThan(avant);

    const calme = 501;
    lif.spikeTotal[calme] = 0;
    const avantCalme = somme(calme);
    homeostasis(topo, lif, p, TAUX_CIBLE);
    expect(somme(calme)).toBeGreaterThan(avantCalme);
  });

  it("borne le facteur de mise à l'échelle par passage", () => {
    const { topo, lif } = monter();
    const p = PLASTICITE_DEFAUT;
    let src = 0;
    while (topo.sign[src] !== 1) src++;
    const j = topo.outTarget[topo.outOffsets[src]];
    lif.spikeTotal[j] = 10_000_000; // absurdement actif
    const e = topo.outOffsets[src];
    const avant = topo.w[e];
    homeostasis(topo, lif, p, TAUX_CIBLE);
    expect(topo.w[e]).toBeGreaterThan(avant * (1 - p.homeoClamp - 1e-6));
  });

  it("remet les compteurs de décharge à zéro", () => {
    const { topo, lif } = monter();
    lif.spikeTotal[7] = 42;
    homeostasis(topo, lif, PLASTICITE_DEFAUT, TAUX_CIBLE);
    expect(lif.spikeTotal[7]).toBe(0);
  });
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Commande : `npx vitest run src/sim/plasticity.test.ts`
Attendu : ÉCHEC — « Failed to resolve import "./plasticity" ».

- [ ] **Étape 3 : ajouter `PlasticityParams` / `PLASTICITE_DEFAUT` dans `params.ts`**

```ts
export const PLASTICITE_DEFAUT: PlasticityParams = {
  tauPre: 20, tauPost: 20, tauElig: 60,
  aPlus: 0.012, aMinus: 0.0105,
  lr: 0.05,
  dumpEvery: 16, dumpNow: 0.6,
  homeoEvery: 500, homeoRate: 0.15, homeoClamp: 0.05,
  wMax: 1.5,
};
```

`aMinus` légèrement inférieur à `aPlus` est le choix standard qui évite la dérive vers zéro
d'un réseau à activité irrégulière. La tâche 9 pourra corriger ces valeurs par mesure.

- [ ] **Étape 4 : écrire `src/sim/plasticity.ts`**

Points d'attention :
- La LUT se construit une fois : `lut[k] = k >= 4 * tauElig ? 0 : Math.exp(-k / tauElig)`.
- `accumulateEligibility` fait **trois** parcours dans cet ordre : (a) LTD par arête sortante
  des neurones ayant déchargé (sources excitatrices seulement), (b) LTP par arête entrante
  des neurones ayant déchargé, (c) mise à jour des traces (`+1` sur les neurones ayant
  déchargé, puis décroissance multiplicative de `preTrace` et `postTrace`).
- La décroissance des traces est un `for` sur `n` : à `n` = 50 000 c'est 100 000 opérations
  par tick, acceptable, et bien plus simple qu'une seconde décroissance paresseuse.
- `addDopamine` accumule `daAccum += da`, puis déverse si
  `lif.t - lastDump >= dumpEvery || Math.abs(daAccum) >= dumpNow`.
- `homeostasis` calcule pour chaque neurone `j` le taux observé
  `spikeTotal[j] / homeoEvery`, en déduit
  `facteur = 1 + homeoRate * (tauxCible - observe) / tauxCible`, le borne à
  `[1 - homeoClamp, 1 + homeoClamp]`, multiplie les poids entrants **excitateurs** de `j`,
  clampe à `[0, wMax]`, puis remet `spikeTotal` à zéro.

- [ ] **Étape 5 : lancer les tests et vérifier qu'ils passent**

Commande : `npx vitest run src/sim/plasticity.test.ts`
Attendu : SUCCÈS, 10 tests.

- [ ] **Étape 6 : vérifier que la plasticité ne casse pas le régime calibré**

Ajouter à `calibration.probe.test.ts` un test qui rejoue la sonde **avec** plasticité et
dopamine aléatoire de moyenne nulle, et vérifie que les bornes de régime de la tâche 3 tiennent
toujours sur 5 000 ticks. C'est le test qui attrape la crise épileptique et l'extinction — les
deux modes d'échec nommés dans la conception.

Commande : `npx vitest run src/sim/calibration.probe.test.ts`
Attendu : SUCCÈS, 4 tests. **Si ce test échoue, régler `homeoRate` / `lr` avant de continuer.**

- [ ] **Étape 7 : commit**

```bash
git add src/sim/plasticity.ts src/sim/plasticity.test.ts src/sim/params.ts src/sim/calibration.probe.test.ts
git commit -m "feat(vie): règle à trois facteurs, éligibilité paresseuse et homéostasie"
```

---

## Tâche 5 : le monde et l'enjeu

**Fichiers :**
- Créer : `src/sim/world.ts`
- Modifier : `src/sim/params.ts` (`WorldParams`, `MONDE_DEFAUT`)
- Test : `src/sim/world.test.ts`

`src/lib/world.ts` (monde de la créature du parcours `/theorie`) n'est **pas** modifié ni
réutilisé : il est symbolique par essai, incompatible avec l'enjeu de survie. Les deux
coexistent.

**Interfaces :**
- Consomme : `RNG`, `MotorAction`, `Sensation` (params.ts).
- Produit :
  ```ts
  export interface WorldParams {
    arena: number;        // demi-côté de l'arène
    nFood: number; nToxin: number;
    foodRadius: number;   // rayon d'absorption
    energyMax: number; energyStart: number;
    gainFood: number; lossToxin: number; lossPredator: number;
    rFood: number; rToxin: number; rPredator: number;
    metabRest: number; metabMove: number;
    stepLen: number; turnStep: number;   // déplacement et rotation par action
    predatorSpeed: number; predatorSense: number; predatorContact: number;
    alarmRange: number;   // portée de l'émission ALARM (> predatorSpeed · horizon)
    olfRange: number;     // portée olfactive
    respawnEvery: number; // ticks avant réapparition d'une pastille consommée
  }

  export interface WorldState {
    t: number;
    x: number; y: number; heading: number;
    energy: number;
    alive: boolean;
    foodX: Float32Array; foodY: Float32Array; foodCooldown: Int32Array;
    toxinX: Float32Array; toxinY: Float32Array; toxinCooldown: Int32Array;
    predX: number; predY: number;
    ateFood: number; ateToxin: number; hits: number; deaths: number;
    lifeTicks: number;          // ticks écoulés depuis la dernière réapparition
    lifetimes: number[];        // durées de vie closes
  }

  export type WorldEventKind = "FOOD" | "TOXIN" | "PREDATOR" | "DEATH";

  export interface WorldStep {
    reward: number;
    event: WorldEventKind | null;
    died: boolean;
  }

  export function createWorld(p: WorldParams, rng: RNG): WorldState;
  export function sense(w: WorldState, p: WorldParams): Sensation;
  export function stepWorld(w: WorldState, p: WorldParams, action: MotorAction, rng: RNG): WorldStep;
  ```

**Encodage sensoriel.** Pour chaque source (nourriture, toxine), on projette son gisement
**relatif au cap** de l'organisme sur 24 secteurs, avec une intensité
`max(0, 1 - distance / olfRange)`, et on prend le maximum par secteur avec un léger étalement
sur les secteurs voisins (noyau `[0.5, 1, 0.5]` normalisé) — un codage par population, sans
seuil binaire. `ALARM` fait pareil sur 16 secteurs avec `alarmRange`. `SOMA` s'allume sur les
8 secteurs correspondant aux murs à portée de contact. `INTERO` reçoit `energy / energyMax`.

**Point crucial** : nourriture et toxine ont la **même signature de départ** — c'est-à-dire
que la fonction d'encodage est identique, seuls les canaux diffèrent. L'organisme ne peut
donc pas les distinguer « gratuitement » : il doit apprendre que le canal `OLF_TOXIN` prédit
une punition. Ne surtout pas rendre l'un plus intense que l'autre.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/sim/world.test.ts
import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/rng";
import { createWorld, sense, stepWorld } from "./world";
import { MONDE_DEFAUT } from "./params";

const p = MONDE_DEFAUT;

describe("createWorld", () => {
  it("place l'organisme au centre, plein d'énergie, vivant", () => {
    const w = createWorld(p, mulberry32(1));
    expect(w.x).toBe(0);
    expect(w.y).toBe(0);
    expect(w.energy).toBe(p.energyStart);
    expect(w.alive).toBe(true);
    expect(w.foodX.length).toBe(p.nFood);
    expect(w.toxinX.length).toBe(p.nToxin);
  });

  it("est déterministe pour une même graine", () => {
    const a = createWorld(p, mulberry32(5));
    const b = createWorld(p, mulberry32(5));
    expect(Array.from(a.foodX)).toEqual(Array.from(b.foodX));
  });
});

describe("sensations", () => {
  it("code la nourriture et la toxine avec la MÊME fonction (indiscernables a priori)", () => {
    const w = createWorld(p, mulberry32(1));
    // une pastille de chaque, à la même position relative
    w.foodX[0] = 20; w.foodY[0] = 0; w.foodCooldown[0] = 0;
    w.toxinX[0] = 20; w.toxinY[0] = 0; w.toxinCooldown[0] = 0;
    for (let i = 1; i < p.nFood; i++) w.foodCooldown[i] = 10_000;
    for (let i = 1; i < p.nToxin; i++) w.toxinCooldown[i] = 10_000;
    const s = sense(w, p);
    expect(Array.from(s.food)).toEqual(Array.from(s.toxin));
  });

  it("place l'intensité dans le secteur du gisement et décroît avec la distance", () => {
    const w = createWorld(p, mulberry32(1));
    for (let i = 0; i < p.nFood; i++) w.foodCooldown[i] = 10_000;
    w.foodX[0] = 10; w.foodY[0] = 0; w.foodCooldown[0] = 0; // droit devant (cap 0)
    const proche = sense(w, p);
    w.foodX[0] = p.olfRange * 0.9;
    const loin = sense(w, p);
    const argmax = (a: Float32Array) => a.indexOf(Math.max(...Array.from(a)));
    expect(argmax(proche)).toBe(0); // secteur 0 = droit devant
    expect(Math.max(...Array.from(proche))).toBeGreaterThan(Math.max(...Array.from(loin)));
  });

  it("code l'énergie dans [0, 1]", () => {
    const w = createWorld(p, mulberry32(1));
    expect(sense(w, p).energy).toBeCloseTo(p.energyStart / p.energyMax, 5);
    w.energy = 0;
    expect(sense(w, p).energy).toBe(0);
  });
});

describe("stepWorld", () => {
  it("fait payer le métabolisme, plus cher en mouvement qu'au repos", () => {
    const a = createWorld(p, mulberry32(1));
    const b = createWorld(p, mulberry32(1));
    stepWorld(a, p, "STOP", mulberry32(2));
    stepWorld(b, p, "AVANCER", mulberry32(2));
    expect(a.energy).toBeLessThan(p.energyStart);
    expect(b.energy).toBeLessThan(a.energy);
  });

  it("récompense la nourriture, punit la toxine", () => {
    const w = createWorld(p, mulberry32(1));
    for (let i = 0; i < p.nToxin; i++) w.toxinCooldown[i] = 10_000;
    for (let i = 1; i < p.nFood; i++) w.foodCooldown[i] = 10_000;
    w.foodX[0] = w.x + 1; w.foodY[0] = w.y; w.foodCooldown[0] = 0;
    const r = stepWorld(w, p, "AVANCER", mulberry32(2));
    expect(r.reward).toBeGreaterThan(0);
    expect(r.event).toBe("FOOD");
    expect(w.ateFood).toBe(1);

    const w2 = createWorld(p, mulberry32(1));
    for (let i = 0; i < p.nFood; i++) w2.foodCooldown[i] = 10_000;
    for (let i = 1; i < p.nToxin; i++) w2.toxinCooldown[i] = 10_000;
    w2.toxinX[0] = w2.x + 1; w2.toxinY[0] = w2.y; w2.toxinCooldown[0] = 0;
    const r2 = stepWorld(w2, p, "AVANCER", mulberry32(2));
    expect(r2.reward).toBeLessThan(0);
    expect(r2.event).toBe("TOXIN");
    expect(w2.energy).toBeLessThan(p.energyStart - p.lossToxin + 1);
  });

  it("tourne sans avancer sur GAUCHE et DROITE, en sens opposés", () => {
    const a = createWorld(p, mulberry32(1));
    const b = createWorld(p, mulberry32(1));
    stepWorld(a, p, "GAUCHE", mulberry32(2));
    stepWorld(b, p, "DROITE", mulberry32(2));
    expect(a.heading).toBeCloseTo(p.turnStep, 6);
    expect(b.heading).toBeCloseTo(-p.turnStep, 6);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(0, 6);
  });

  it("garde l'organisme dans l'arène", () => {
    const w = createWorld(p, mulberry32(1));
    for (let k = 0; k < 2000; k++) stepWorld(w, p, "AVANCER", mulberry32(k + 1));
    expect(Math.abs(w.x)).toBeLessThanOrEqual(p.arena);
    expect(Math.abs(w.y)).toBeLessThanOrEqual(p.arena);
  });

  it("fait mourir à énergie nulle, réapparaître au centre, et enregistre la durée de vie", () => {
    const w = createWorld(p, mulberry32(1));
    w.energy = p.metabRest * 0.5; // il ne survit pas au prochain tick
    const r = stepWorld(w, p, "STOP", mulberry32(2));
    expect(r.died).toBe(true);
    expect(r.event).toBe("DEATH");
    expect(w.deaths).toBe(1);
    expect(w.lifetimes.length).toBe(1);
    expect(w.x).toBe(0);
    expect(w.y).toBe(0);
    expect(w.energy).toBe(p.energyStart);
    expect(w.lifeTicks).toBe(0);
  });

  it("fait poursuivre le prédateur quand l'organisme est à portée de détection", () => {
    const w = createWorld(p, mulberry32(1));
    w.x = 0; w.y = 0;
    w.predX = p.predatorSense * 0.5; w.predY = 0;
    const d0 = Math.hypot(w.predX - w.x, w.predY - w.y);
    stepWorld(w, p, "STOP", mulberry32(2));
    const d1 = Math.hypot(w.predX - w.x, w.predY - w.y);
    expect(d1).toBeLessThan(d0);
  });

  it("émet l'alarme plus loin que la portée de contact du prédateur", () => {
    expect(p.alarmRange).toBeGreaterThan(p.predatorContact * 4);
    const w = createWorld(p, mulberry32(1));
    w.predX = p.alarmRange * 0.5; w.predY = 0;
    const s = sense(w, p);
    expect(Math.max(...Array.from(s.alarm))).toBeGreaterThan(0);
  });

  it("fait réapparaître une pastille consommée après respawnEvery ticks", () => {
    const w = createWorld(p, mulberry32(1));
    for (let i = 1; i < p.nFood; i++) w.foodCooldown[i] = 10_000;
    w.foodX[0] = w.x + 1; w.foodY[0] = w.y; w.foodCooldown[0] = 0;
    stepWorld(w, p, "AVANCER", mulberry32(2));
    expect(w.foodCooldown[0]).toBe(p.respawnEvery);
    for (let k = 0; k < p.respawnEvery; k++) stepWorld(w, p, "STOP", mulberry32(k + 3));
    expect(w.foodCooldown[0]).toBe(0);
  });

  it("est déterministe : même graine, même trajectoire", () => {
    const run = () => {
      const w = createWorld(p, mulberry32(9));
      const rng = mulberry32(10);
      const acts = ["AVANCER", "GAUCHE", "AVANCER", "DROITE"] as const;
      const trace: number[] = [];
      for (let k = 0; k < 500; k++) {
        trace.push(stepWorld(w, p, acts[k % 4], rng).reward);
      }
      return { trace, x: w.x, y: w.y, energy: w.energy };
    };
    expect(run()).toEqual(run());
  });
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Commande : `npx vitest run src/sim/world.test.ts`
Attendu : ÉCHEC — « Failed to resolve import "./world" ».

- [ ] **Étape 3 : ajouter `WorldParams` / `MONDE_DEFAUT` dans `params.ts`**

Les valeurs de la conception, exprimées en ticks (un tick = un pas de monde) :

```ts
export const MONDE_DEFAUT: WorldParams = {
  arena: 120,
  nFood: 14, nToxin: 14,
  foodRadius: 5,
  energyMax: 100, energyStart: 60,
  gainFood: 22, lossToxin: 30, lossPredator: 45,
  rFood: 1, rToxin: -1.4, rPredator: -2,
  metabRest: 0.05, metabMove: 0.18,
  stepLen: 1.4, turnStep: 0.22,
  predatorSpeed: 0.9, predatorSense: 55, predatorContact: 6,
  alarmRange: 90, olfRange: 70,
  respawnEvery: 240,
};
```

- [ ] **Étape 4 : écrire `src/sim/world.ts`**

Le prédateur poursuit à `predatorSpeed` quand la distance est sous `predatorSense`, sinon
dérive lentement. `stepWorld` applique dans l'ordre : action → métabolisme → collisions
(nourriture, toxine, prédateur) → décrément des `cooldown` → test de mort. Une seule
`WorldEventKind` est renvoyée par tick, avec l'ordre de priorité `DEATH > PREDATOR > TOXIN >
FOOD` (un tick qui tue prime sur ce qui l'a causé — le journal du lot 3 verra les deux
puisque `reward` cumule).

- [ ] **Étape 5 : lancer les tests et vérifier qu'ils passent**

Commande : `npx vitest run src/sim/world.test.ts`
Attendu : SUCCÈS, 12 tests.

- [ ] **Étape 6 : commit**

```bash
git add src/sim/world.ts src/sim/world.test.ts src/sim/params.ts
git commit -m "feat(vie): arène, nourriture/toxine indiscernables, prédateur, énergie et mort"
```

---

## Tâche 6 : cerveau — encodage capteurs et décodage moteur par course au seuil

**Fichiers :**
- Créer : `src/sim/brain.ts`
- Modifier : `src/sim/params.ts` (`BrainParams`, `CERVEAU_DEFAUT`)
- Test : `src/sim/brain.test.ts`

**Interfaces :**
- Consomme : `Topology`, `LifState`, `PlasticityState`, `Sensation`, `MotorAction`.
- Produit :
  ```ts
  export interface BrainParams {
    topology: TopologyParams;
    lif: LifParams;
    plasticity: PlasticityParams;
    injectGain: number;    // conversion intensité perçue → courant injecté
    accLeak: number;       // fuite de l'accumulateur moteur, par tick
    accGain: number;       // conversion taux de décharge du pool → preuve
    accSeuil: number;      // seuil de décision
    accTimeout: number;    // ticks au-delà desquels une action par défaut est forcée
    accDefault: MotorAction;
  }

  export interface Brain {
    topo: Topology;
    lif: LifState;
    plast: PlasticityState;
    params: BrainParams;
    acc: Float32Array;        // [4] accumulateurs de preuve, un par pool moteur
    ticksSinceDecision: number;
    lastDecision: MotorAction | null;
  }

  export function createBrain(p: BrainParams): Brain;
  /** Convertit une sensation en courants injectés dans les régions sensorielles. */
  export function encodeSensation(brain: Brain, s: Sensation): void;
  /** Un tick de cerveau : LIF + éligibilité + accumulateurs. Renvoie l'action si une décision est tombée. */
  export function stepBrain(brain: Brain, rng: RNG): MotorAction | null;
  /** État des accumulateurs, pour l'affichage du lot 2. */
  export function motorAccumulators(brain: Brain): Float32Array;
  ```

**Encodage.** Pour chaque secteur `b` de chaque modalité, injecter
`injectGain * intensité[b]` dans **chaque** neurone du pool `b` de la région correspondante.
L'intéroception encode l'énergie par un **pic glissant** : le pool
`round(energy * (pools - 1))` reçoit l'injection maximale, ses voisins immédiats la moitié.
L'organisme *sent* sa faim, ce qui permet à la faim de moduler la décision.

**Décodage.** Pour chaque pool moteur `k`, compter les décharges du tick dans le pool
(`rate[k]`), puis :

```
acc[k] = max(0, acc[k] * (1 - accLeak) + accGain * rate[k] / poolSize)
```

Le premier `acc[k] >= accSeuil` gagne (égalité départagée par l'indice le plus petit),
l'action est renvoyée, **tous** les accumulateurs sont remis à zéro et
`ticksSinceDecision = 0`. Si `ticksSinceDecision >= accTimeout`, `accDefault` est renvoyée et
les accumulateurs sont remis à zéro de la même façon. C'est **là** que se lit le choix : la
preuve s'accumule, puis bascule.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// src/sim/brain.test.ts
import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/rng";
import { createBrain, encodeSensation, stepBrain, motorAccumulators } from "./brain";
import { regionById, poolRange } from "./topology";
import { CERVEAU_DEFAUT, ACTIONS } from "./params";

const cfg = (over = {}) => ({
  ...CERVEAU_DEFAUT,
  topology: { ...CERVEAU_DEFAUT.topology, n: 2500, seed: 4 },
  ...over,
});

const sensationVide = () => ({
  food: new Float32Array(24), toxin: new Float32Array(24),
  alarm: new Float32Array(16), soma: new Float32Array(8), energy: 0.5,
});

describe("encodeSensation", () => {
  it("injecte du courant dans le pool du secteur excité, et nulle part ailleurs", () => {
    const b = createBrain(cfg());
    const s = sensationVide();
    s.food[3] = 1;
    encodeSensation(b, s);
    const r = regionById(b.topo, "OLF_FOOD");
    const { start, end } = poolRange(r, 3);
    for (let i = start; i < end; i++) expect(b.lif.inject[i]).toBeGreaterThan(0);
    const autre = poolRange(r, 10);
    for (let i = autre.start; i < autre.end; i++) expect(b.lif.inject[i]).toBe(0);
  });

  it("sépare les canaux nourriture et toxine", () => {
    const b = createBrain(cfg());
    const s = sensationVide();
    s.toxin[5] = 1;
    encodeSensation(b, s);
    const food = regionById(b.topo, "OLF_FOOD");
    let sommeFood = 0;
    for (let i = food.start; i < food.start + food.count; i++) sommeFood += b.lif.inject[i];
    expect(sommeFood).toBe(0);
    const tox = poolRange(regionById(b.topo, "OLF_TOXIN"), 5);
    expect(b.lif.inject[tox.start]).toBeGreaterThan(0);
  });

  it("code l'énergie par un pic glissant sur les pools intéroceptifs", () => {
    const b = createBrain(cfg());
    const inter = regionById(b.topo, "INTERO");
    const picPour = (energy: number) => {
      b.lif.inject.fill(0);
      const s = sensationVide();
      s.energy = energy;
      encodeSensation(b, s);
      let best = -1;
      let bestV = -1;
      for (let pool = 0; pool < inter.pools; pool++) {
        const { start } = poolRange(inter, pool);
        if (b.lif.inject[start] > bestV) { bestV = b.lif.inject[start]; best = pool; }
      }
      return best;
    };
    expect(picPour(0)).toBeLessThan(picPour(1));
    expect(picPour(0.5)).toBeGreaterThan(picPour(0));
    expect(picPour(0.5)).toBeLessThan(picPour(1));
  });
});

describe("décodage moteur par course au seuil", () => {
  it("ne décide rien tant qu'aucun accumulateur n'a franchi le seuil", () => {
    const b = createBrain(cfg({ accSeuil: 1e9, accTimeout: 1e9 }));
    for (let k = 0; k < 50; k++) expect(stepBrain(b, mulberry32(1))).toBeNull();
  });

  it("renvoie l'action du premier pool à franchir le seuil, et remet tout à zéro", () => {
    const b = createBrain(cfg({ accTimeout: 1e9 }));
    b.acc[2] = b.params.accSeuil * 0.999;
    // on force le pool 2 à décharger fortement
    const mot = regionById(b.topo, "MOTOR");
    const { start, end } = poolRange(mot, 2);
    for (let i = start; i < end; i++) b.lif.inject[i] = 10;
    const action = stepBrain(b, mulberry32(1));
    expect(action).toBe(ACTIONS[2]);
    expect(Array.from(motorAccumulators(b))).toEqual([0, 0, 0, 0]);
    expect(b.ticksSinceDecision).toBe(0);
  });

  it("fait décroître les accumulateurs en l'absence de décharges motrices", () => {
    const b = createBrain(cfg({ accSeuil: 1e9, accTimeout: 1e9 }));
    b.acc[0] = 1;
    stepBrain(b, mulberry32(1));
    expect(b.acc[0]).toBeLessThan(1);
    expect(b.acc[0]).toBeGreaterThanOrEqual(0);
  });

  it("force l'action par défaut au bout de accTimeout ticks sans décision", () => {
    const b = createBrain(cfg({ accSeuil: 1e9, accTimeout: 7 }));
    let action: string | null = null;
    for (let k = 0; k < 7; k++) action = stepBrain(b, mulberry32(1));
    expect(action).toBe(b.params.accDefault);
    expect(b.ticksSinceDecision).toBe(0);
  });

  it("ne garde jamais un accumulateur négatif", () => {
    const b = createBrain(cfg({ accSeuil: 1e9, accTimeout: 1e9 }));
    for (let k = 0; k < 200; k++) {
      stepBrain(b, mulberry32(k + 1));
      for (const v of motorAccumulators(b)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("est déterministe pour une même graine", () => {
    const run = () => {
      const b = createBrain(cfg());
      const rng = mulberry32(21);
      const out: Array<string | null> = [];
      for (let k = 0; k < 300; k++) {
        const s = sensationVide();
        s.food[k % 24] = 0.7;
        encodeSensation(b, s);
        out.push(stepBrain(b, rng));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Commande : `npx vitest run src/sim/brain.test.ts`
Attendu : ÉCHEC — « Failed to resolve import "./brain" ».

- [ ] **Étape 3 : ajouter `BrainParams` / `CERVEAU_DEFAUT` dans `params.ts`**

```ts
export const CERVEAU_DEFAUT: BrainParams = {
  topology: TOPOLOGIE_DEFAUT,
  lif: LIF_DEFAUT,
  plasticity: PLASTICITE_DEFAUT,
  injectGain: 0.35,
  accLeak: 0.06, accGain: 1.0, accSeuil: 2.5,
  accTimeout: 60, accDefault: "AVANCER",
};
```

`accSeuil` et `accGain` seront ajustés à la tâche 7 pour que l'intervalle médian entre deux
décisions tombe dans une plage jouable (mesurée, pas devinée).

- [ ] **Étape 4 : écrire `src/sim/brain.ts`**

`stepBrain` enchaîne : `stepLif` → `accumulateEligibility` → mise à jour des accumulateurs à
partir de `lif.fired` restreint aux pools moteurs → test de seuil / timeout. La dopamine et
l'homéostasie **ne sont pas** appelées ici : c'est `organism.ts` qui les pilote, parce qu'elles
dépendent du monde.

- [ ] **Étape 5 : lancer les tests et vérifier qu'ils passent**

Commande : `npx vitest run src/sim/brain.test.ts`
Attendu : SUCCÈS, 9 tests.

- [ ] **Étape 6 : commit**

```bash
git add src/sim/brain.ts src/sim/brain.test.ts src/sim/params.ts
git commit -m "feat(vie): encodage sensoriel par population et décision par course au seuil"
```

---

## Tâche 7 : l'organisme — boucle fermée, dopamine injectable, journal

**Fichiers :**
- Créer : `src/sim/organism.ts`
- Créer : `src/sim/metrics.ts`
- Modifier : `src/sim/params.ts` (`OrganismParams`, `ORGANISME_DEFAUT`)
- Test : `src/sim/organism.test.ts`
- Test : `src/sim/metrics.test.ts`

**Interfaces :**
- Consomme : tout ce qui précède.
- Produit :
  ```ts
  // metrics.ts
  export interface Metrics {
    ticks: number;
    lifetimes: number[];
    ateFood: number; ateToxin: number; hits: number; deaths: number;
    energySum: number;         // pour l'énergie moyenne
    rewardSum: number;
  }
  export interface Resume {
    ticks: number;
    lifetimeMedian: number;    // NaN si aucune vie close
    lifetimeMean: number;
    energyMean: number;
    toxinRatio: number;        // ateToxin / (ateFood + ateToxin) ; NaN si rien mangé
    foodPerMilleTicks: number;
    rewardMean: number;
  }
  export function createMetrics(): Metrics;
  export function recordTick(m: Metrics, energy: number, reward: number): void;
  export function recordEvent(m: Metrics, ev: WorldEventKind, lifeTicks: number): void;
  export function summarize(m: Metrics): Resume;
  /** Découpe un journal de vies en deux moitiés d'expérience (par ticks, pas par nombre de vies). */
  export function splitHalves(lifetimes: number[]): { first: number[]; second: number[] };
  export function median(xs: number[]): number;

  // organism.ts
  export interface DopamineContext {
    reward: number;
    rBar: number;          // moyenne glissante des récompenses
    t: number;
    event: WorldEventKind | null;
  }
  export interface OrganismEvent {
    t: number;
    kind: WorldEventKind;
    reward: number;
    /** Neurones ayant déchargé à ce tick — vue vivante, à copier si on veut la garder. */
    spikes: Int32Array;
    spikeCount: number;
  }
  export interface OrganismOptions {
    /** 0 pour le témoin gelé. Défaut : PLASTICITE_DEFAUT.lr. */
    lr?: number;
    /** Défaut : (ctx) => ctx.reward - ctx.rBar. Le témoin yoked rejoue un calendrier. */
    dopamineSource?: (ctx: DopamineContext) => number;
    /** Journal des événements du monde, avec les décharges du tick (protocole lésion). */
    onEvent?: (ev: OrganismEvent) => void;
    /** Masque de neurones éteints (protocole lésion). */
    lesion?: Uint8Array | null;
  }
  export interface OrganismParams {
    brain: BrainParams;
    world: WorldParams;
    tauReward: number;   // constante de la moyenne glissante rBar, en ticks
  }
  export interface Organism {
    brain: Brain;
    world: WorldState;
    metrics: Metrics;
    params: OrganismParams;
    rBar: number;
    lastAction: MotorAction | null;
    daLog: number[];   // calendrier de dopamine émis — sert de source au témoin yoked
  }
  export function createOrganism(p: OrganismParams, options?: OrganismOptions): Organism;
  export function stepOrganism(org: Organism, rng: RNG): { action: MotorAction | null; reward: number };
  export function runOrganism(org: Organism, ticks: number, rng: RNG): void;
  ```

**Boucle d'un tick**, dans cet ordre :

1. `sense(world)` → `encodeSensation(brain, s)`.
2. `stepBrain(brain, rng)` → action ou `null`.
3. Si action : `stepWorld(world, action)` ; sinon `stepWorld(world, "STOP")` avec le
   métabolisme de repos — le monde avance toujours, l'organisme ne peut pas mettre le temps
   en pause en hésitant. (C'est ce qui rend l'hésitation coûteuse, donc ce qui donne un sens
   à la course au seuil.)
4. `rBar += (reward - rBar) / tauReward`.
5. `da = options.dopamineSource(ctx)`, poussé dans `daLog`, puis
   `addDopamine(topo, lif, plast, plasticity, da)`.
6. Si `lif.t % homeoEvery === 0` : `homeostasis(...)`.
7. Si `step.event` : `options.onEvent(...)` puis `recordEvent(metrics, ...)`.
8. `recordTick(metrics, world.energy, reward)`.

**Le point 5 est la couture du témoin yoked** : `daLog` enregistre exactement ce qui a été
émis, donc un agent A peut fournir à un agent B `dopamineSource: (ctx) => logA[ctx.t] ?? 0`.
Le lot 1 se contente de vérifier que la substitution fonctionne.

- [ ] **Étape 1 : écrire les tests qui échouent (metrics)**

```ts
// src/sim/metrics.test.ts
import { describe, it, expect } from "vitest";
import { createMetrics, recordTick, recordEvent, summarize, splitHalves, median } from "./metrics";

describe("median", () => {
  it("gère les tailles paires et impaires, et le vide", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe("splitHalves", () => {
  it("coupe le journal des vies au milieu du TEMPS, pas au milieu du nombre de vies", () => {
    // 3 vies courtes puis 1 très longue : la coupe temporelle doit isoler la longue
    const { first, second } = splitHalves([10, 10, 10, 200]);
    expect(first).toEqual([10, 10, 10]);
    expect(second).toEqual([200]);
  });

  it("renvoie deux moitiés vides pour un journal vide", () => {
    expect(splitHalves([])).toEqual({ first: [], second: [] });
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
  });

  it("renvoie NaN plutôt que 0 quand rien n'a été mangé", () => {
    const m = createMetrics();
    recordTick(m, 10, 0);
    expect(Number.isNaN(summarize(m).toxinRatio)).toBe(true);
  });

  it("enregistre une durée de vie à chaque mort", () => {
    const m = createMetrics();
    recordEvent(m, "DEATH", 321);
    expect(m.lifetimes).toEqual([321]);
    expect(m.deaths).toBe(1);
  });
});
```

- [ ] **Étape 2 : écrire les tests qui échouent (organism)**

```ts
// src/sim/organism.test.ts
import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/rng";
import { createOrganism, stepOrganism, runOrganism } from "./organism";
import { ORGANISME_DEFAUT } from "./params";

const cfg = (over = {}) => ({
  ...ORGANISME_DEFAUT,
  brain: { ...ORGANISME_DEFAUT.brain, topology: { ...ORGANISME_DEFAUT.brain.topology, n: 2500, seed: 4 } },
  ...over,
});

describe("boucle fermée", () => {
  it("fait avancer le monde à chaque tick, même sans décision", () => {
    const org = createOrganism(cfg());
    const t0 = org.world.t;
    for (let k = 0; k < 30; k++) stepOrganism(org, mulberry32(k + 1));
    expect(org.world.t).toBe(t0 + 30);
  });

  it("consomme de l'énergie et finit par mourir si rien n'est mangé", () => {
    const org = createOrganism(cfg());
    // arène vidée : aucune nourriture atteignable
    org.world.foodCooldown.fill(1_000_000);
    org.world.toxinCooldown.fill(1_000_000);
    runOrganism(org, 4000, mulberry32(7));
    expect(org.metrics.deaths).toBeGreaterThan(0);
    expect(org.metrics.lifetimes.length).toBe(org.metrics.deaths);
  });

  it("est déterministe pour une même graine", () => {
    const run = () => {
      const org = createOrganism(cfg());
      runOrganism(org, 1500, mulberry32(31));
      return {
        x: org.world.x, y: org.world.y, energy: org.world.energy,
        food: org.world.ateFood, toxin: org.world.ateToxin,
        da: org.daLog.slice(0, 200),
      };
    };
    expect(run()).toEqual(run());
  });
});

describe("coutures du lot 3", () => {
  it("ne modifie aucun poids quand lr = 0 (témoin gelé)", () => {
    const org = createOrganism(cfg(), { lr: 0 });
    const avant = Float32Array.from(org.brain.topo.w);
    runOrganism(org, 1500, mulberry32(13));
    expect(Array.from(org.brain.topo.w)).toEqual(Array.from(avant));
  });

  it("accepte une source de dopamine substituée (témoin yoked)", () => {
    const donneur = createOrganism(cfg());
    runOrganism(donneur, 800, mulberry32(17));
    expect(donneur.daLog.length).toBe(800);

    const recu: number[] = [];
    const receveur = createOrganism(cfg(), {
      dopamineSource: (ctx) => {
        const v = donneur.daLog[ctx.t] ?? 0;
        recu.push(v);
        return v;
      },
    });
    runOrganism(receveur, 800, mulberry32(17));
    expect(recu.length).toBe(800);
    expect(receveur.daLog).toEqual(donneur.daLog); // la dopamine reçue est bien celle du donneur
  });

  it("émet un journal d'événements portant les décharges du tick", () => {
    const vus: Array<{ kind: string; n: number }> = [];
    const org = createOrganism(cfg(), {
      onEvent: (ev) => vus.push({ kind: ev.kind, n: ev.spikeCount }),
    });
    runOrganism(org, 4000, mulberry32(19));
    expect(vus.length).toBeGreaterThan(0);
    expect(vus.some((v) => v.kind === "DEATH" || v.kind === "FOOD" || v.kind === "TOXIN")).toBe(true);
  });

  it("applique le masque de lésion : les neurones masqués ne déchargent jamais", () => {
    const masque = new Uint8Array(2500);
    for (let i = 100; i < 400; i++) masque[i] = 1;
    const org = createOrganism(cfg(), { lesion: masque });
    runOrganism(org, 600, mulberry32(23));
    for (let i = 100; i < 400; i++) expect(org.brain.lif.spikeTotal[i]).toBe(0);
  });

  it("suit la moyenne glissante des récompenses (dopamine = erreur de prédiction)", () => {
    const org = createOrganism(cfg());
    const das: number[] = [];
    const org2 = createOrganism(cfg(), {
      dopamineSource: (ctx) => {
        das.push(ctx.rBar);
        return ctx.reward - ctx.rBar;
      },
    });
    runOrganism(org2, 1200, mulberry32(29));
    // rBar bouge : l'organisme prend des punitions métaboliques et des récompenses
    expect(new Set(das.map((v) => v.toFixed(6))).size).toBeGreaterThan(1);
  });
});
```

- [ ] **Étape 3 : lancer les tests pour vérifier qu'ils échouent**

Commande : `npx vitest run src/sim/metrics.test.ts src/sim/organism.test.ts`
Attendu : ÉCHEC — imports non résolus.

- [ ] **Étape 4 : écrire `src/sim/metrics.ts`**

`splitHalves` coupe **au milieu du temps cumulé** : on parcourt les durées de vie en cumulant,
et la coupe tombe à la première vie qui fait franchir la moitié du total. Couper au milieu du
*nombre* de vies serait un biais fatal — si l'organisme apprend, la seconde moitié du temps
contient moins de vies (elles sont plus longues), et la comparaison serait truquée en sa
faveur. C'est exactement le genre d'erreur que la preuve de la tâche 9 doit éviter.

- [ ] **Étape 5 : écrire `src/sim/organism.ts` et les params**

```ts
export const ORGANISME_DEFAUT: OrganismParams = {
  brain: CERVEAU_DEFAUT,
  world: MONDE_DEFAUT,
  tauReward: 400,   // ticks — constante de la moyenne glissante rBar
};
```

`createOrganism` pose `brain.lif.silenced = options.lesion ?? null` et
`brain.params.plasticity.lr = options.lr ?? défaut`.

- [ ] **Étape 6 : lancer les tests et vérifier qu'ils passent**

Commande : `npx vitest run src/sim/metrics.test.ts src/sim/organism.test.ts`
Attendu : SUCCÈS, 7 + 9 tests.

- [ ] **Étape 7 : mesurer la cadence de décision et ajuster `accSeuil`**

Ajouter au fichier de sonde un relevé : sur 5 000 ticks, journaliser le **nombre de décisions
prises** et l'**intervalle médian entre décisions**. Ajuster `accSeuil` / `accGain` pour que
l'intervalle médian tombe entre 10 et 60 ticks (assez lent pour être *vu* au lot 2, assez
rapide pour que l'organisme puisse manger avant de mourir). **Journaliser la valeur observée
retenue dans le message de commit et dans la note de calibration.**

- [ ] **Étape 8 : commit**

```bash
git add src/sim/organism.ts src/sim/metrics.ts src/sim/organism.test.ts src/sim/metrics.test.ts src/sim/params.ts
git commit -m "feat(vie): boucle fermée de l'organisme, dopamine injectable et journal d'événements"
```

---

## Tâche 8 : lisser l'exécution — perf et budget

**Fichiers :**
- Créer : `src/sim/bench.probe.test.ts`
- Modifier : `src/sim/params.ts`, `src/sim/plasticity.ts` (si la mesure l'exige)

Cette tâche répond au risque « le balayage dopamine domine le budget CPU » de la conception,
et elle conditionne la faisabilité de la tâche 9 (qui a besoin de beaucoup de ticks).

- [ ] **Étape 1 : écrire le banc**

```ts
// src/sim/bench.probe.test.ts
// Banc de mesure : combien de ticks par seconde, et où part le temps ?
import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/rng";
import { createOrganism, runOrganism } from "./organism";
import { ORGANISME_DEFAUT } from "./params";

function mesure(n: number, ticks: number) {
  const org = createOrganism({
    ...ORGANISME_DEFAUT,
    brain: { ...ORGANISME_DEFAUT.brain, topology: { ...ORGANISME_DEFAUT.brain.topology, n, seed: 4 } },
  });
  const t0 = performance.now();
  runOrganism(org, ticks, mulberry32(1));
  const ms = performance.now() - t0;
  return { ms, tps: (ticks / ms) * 1000, e: org.brain.topo.e };
}

describe("budget", () => {
  it("journalise le débit à plusieurs tailles", () => {
    for (const n of [2500, 10_000, 50_000]) {
      const r = mesure(n, n >= 50_000 ? 2000 : 10_000);
      // eslint-disable-next-line no-console
      console.log(`n=${n} e=${r.e} ${r.ms.toFixed(0)}ms → ${r.tps.toFixed(0)} ticks/s`);
    }
    expect(true).toBe(true);
  }, 600_000);
});
```

- [ ] **Étape 2 : lancer et lire**

Commande : `npx vitest run src/sim/bench.probe.test.ts --reporter=verbose`
Attendu : trois lignes `n=… ticks/s`. **Consigner ces chiffres dans la note de calibration.**

- [ ] **Étape 3 : décider, sur mesure et non sur intuition**

- Si `n = 50 000` tient au moins ~200 ticks/s : ne rien optimiser, le lot 2 pourra tourner en
  temps réel dans un worker. Passer à l'étape 5.
- Si le balayage dopaminergique domine (le vérifier en relançant avec `dumpEvery: 256`, ce qui
  divise son coût par 16 — si le débit bondit, c'est lui) : appliquer le repli **documenté par
  la conception**, un registre d'arêtes touchées depuis le dernier déversement
  (`touchedEdges: Int32Array` + `touchedFlag: Uint8Array`), et ne balayer que celles-là. Dans
  ce cas, `lastTouch` n'est plus réinitialisé partout, la LUT reprend son rôle complet
  (indices jusqu'à `4 · tauElig`), et un test doit vérifier l'**équivalence numérique** entre
  les deux modes sur 500 ticks à `n = 2500`.
- Sinon, optimiser le point chaud identifié, et lui seul.

- [ ] **Étape 4 : si le repli a été implémenté, écrire le test d'équivalence**

```ts
it("le registre d'arêtes touchées donne les mêmes poids que le balayage complet", () => {
  const faire = (registre: boolean) => {
    const org = createOrganism({ /* n: 2500, useTouchedRegistry: registre */ });
    runOrganism(org, 500, mulberry32(3));
    return Array.from(org.brain.topo.w);
  };
  const a = faire(false);
  const b = faire(true);
  for (let e = 0; e < a.length; e++) expect(b[e]).toBeCloseTo(a[e], 5);
}, 120_000);
```

- [ ] **Étape 5 : commit**

```bash
git add src/sim/bench.probe.test.ts docs/superpowers/notes/2026-07-30-vie-calibration.md
git commit -m "test(vie): banc de débit et budget — chiffres mesurés à 2,5k / 10k / 50k neurones"
```

---

## Tâche 9 : la preuve — l'organisme apprend (porte du lot)

**Fichiers :**
- Créer : `src/sim/apprentissage.probe.test.ts`
- Modifier : `docs/superpowers/notes/2026-07-30-vie-calibration.md`
- Modifier : `src/sim/params.ts` (ajustements issus de la mesure)

C'est **la** tâche qui décide si le projet tient. Elle correspond au protocole 1 de la
conception ; les protocoles 2 à 4 (gelé, yoked, lésion) sont le lot 3 — les coutures sont
déjà en place et testées (tâche 7), mais leurs expériences ne sont pas dans ce lot.

**Discipline obligatoire, dans cet ordre :** (a) écrire le banc sans assertion chiffrée,
(b) lancer, (c) consigner les valeurs observées, (d) *seulement alors* figer les seuils.
Écrire `×1,5` en assertion à l'étape (a) reviendrait à transformer la tâche en recherche de
paramètres déguisée en débogage — c'est le piège que ce plan interdit explicitement.

- [ ] **Étape 1 : écrire le banc de mesure (sans assertion chiffrée)**

```ts
// src/sim/apprentissage.probe.test.ts
// Protocole 1 : l'organisme apprend-il à rester en vie ?
// Les seuils de ce fichier sont issus de la mesure de l'étape 3. Aucun nombre n'y est écrit
// avant d'avoir été observé.
import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/rng";
import { createOrganism, runOrganism } from "./organism";
import { median, splitHalves, summarize } from "./metrics";
import { ORGANISME_DEFAUT } from "./params";

/** Fait vivre un organisme et renvoie les statistiques par moitié d'expérience. */
export function experience(n: number, seed: number, ticks: number) {
  const org = createOrganism({
    ...ORGANISME_DEFAUT,
    brain: { ...ORGANISME_DEFAUT.brain, topology: { ...ORGANISME_DEFAUT.brain.topology, n, seed } },
  });
  // relevés par tranche, pour voir la progression et pas seulement les deux bouts
  const TRANCHES = 8;
  const parTranche: Array<{ vies: number[]; food: number; toxin: number; energie: number }> = [];
  let refFood = 0;
  let refToxin = 0;
  let refVies = 0;
  for (let s = 0; s < TRANCHES; s++) {
    const eSomme0 = org.metrics.energySum;
    const t0 = org.metrics.ticks;
    runOrganism(org, Math.floor(ticks / TRANCHES), mulberry32(seed * 7919 + s));
    parTranche.push({
      vies: org.metrics.lifetimes.slice(refVies),
      food: org.metrics.ateFood - refFood,
      toxin: org.metrics.ateToxin - refToxin,
      energie: (org.metrics.energySum - eSomme0) / (org.metrics.ticks - t0),
    });
    refVies = org.metrics.lifetimes.length;
    refFood = org.metrics.ateFood;
    refToxin = org.metrics.ateToxin;
  }
  const { first, second } = splitHalves(org.metrics.lifetimes);
  return { org, parTranche, first, second, resume: summarize(org.metrics) };
}

describe("apprentissage (banc de mesure)", () => {
  it("journalise la progression sur plusieurs graines", () => {
    for (const seed of [1, 2, 3]) {
      const r = experience(2500, seed, 400_000);
      // eslint-disable-next-line no-console
      console.log(`graine=${seed} vies=${r.org.metrics.lifetimes.length} ` +
        `médiane 1re moitié=${median(r.first).toFixed(1)} 2e moitié=${median(r.second).toFixed(1)} ` +
        `ratio toxine=${r.resume.toxinRatio.toFixed(3)} énergie moyenne=${r.resume.energyMean.toFixed(1)}`);
      for (const [i, tr] of r.parTranche.entries()) {
        // eslint-disable-next-line no-console
        console.log(`  tranche ${i}: vies=${tr.vies.length} médiane=${median(tr.vies).toFixed(1)} ` +
          `food=${tr.food} toxin=${tr.toxin} énergie=${tr.energie.toFixed(1)}`);
      }
    }
    expect(true).toBe(true);
  }, 1_800_000);
});
```

- [ ] **Étape 2 : lancer le banc**

Commande : `npx vitest run src/sim/apprentissage.probe.test.ts --reporter=verbose`

Le budget de ticks (`400_000`) et la taille (`2500`) sont un **point de départ dérivé de la
tâche 8** : les ajuster pour que l'expérience tienne en quelques minutes par graine. Si le
débit mesuré ne le permet pas, réduire `n` avant de réduire les ticks — l'apprentissage a
besoin de temps, pas de neurones.

- [ ] **Étape 3 : lire, régler, consigner**

On cherche une progression **monotone par tranche**, pas seulement un écart entre les deux
bouts (un écart peut venir du hasard d'une graine ; huit tranches croissantes, non).

Leviers, dans cet ordre de priorité :
1. `lr` trop faible (rien ne bouge) ou trop fort (le régime se dégrade — vérifier avec la
   porte de la tâche 3, qui doit rester verte).
2. `tauElig` : si l'organisme ne relie pas l'action à la conséquence, l'éligibilité s'éteint
   avant la récompense. Comparer le délai typique entre une décision et l'ingestion (mesurable
   depuis le journal `onEvent`) et `tauElig`.
3. `tauReward` : si `rBar` suit trop vite la récompense, `da` est toujours ≈ 0 et rien n'est
   appris.
4. Le monde : si l'organisme meurt avant d'avoir goûté quoi que ce soit, augmenter `nFood` ou
   `olfRange`. Rendre le monde plus clément est légitime ; rendre la toxine détectable
   *a priori* ne l'est pas.

Consigner dans la note de calibration : paramètres finaux, la table de tranches de chaque
graine, et les valeurs observées de médiane 1re/2e moitié et de ratio toxine.

**Si après réglage il n'y a pas de progression :** s'arrêter, écrire la mesure négative dans
la note, et le signaler. Un résultat négatif honnêtement mesuré est le livrable attendu — ce
projet a déjà documenté un mur du crédit plutôt que de le maquiller, et cette exigence-là ne
se négocie pas.

- [ ] **Étape 4 : figer la porte avec les seuils mesurés**

Remplacer le banc par la porte. Les seuils viennent de l'étape 3, avec une marge : viser
**80 % de l'effet observé** pour absorber la variance inter-graines, et vérifier la porte sur
au moins trois graines.

```ts
// Seuils issus de la mesure du 2026-07-30, pris à ~80 % de l'effet observé pour absorber
// la variance inter-graines. Remplacer les ___ par les valeurs relevées à l'étape 3.
const SEUIL_VIE = ___;     // médiane 2e moitié / médiane 1re moitié observée : ___
const SEUIL_TOXINE = ___;  // ratio toxine fin / ratio toxine début observé : ___

it("apprend : la durée de vie médiane croît entre la première et la seconde moitié", () => {
  const r = experience(2500, 1, 400_000);
  // observé le 2026-07-30 (voir notes/2026-07-30-vie-calibration.md) : ___ → ___
  expect(median(r.second)).toBeGreaterThan(median(r.first) * SEUIL_VIE);
}, 1_800_000);

it("apprend : le ratio toxine/nourriture baisse au fil de l'expérience", () => {
  const r = experience(2500, 1, 400_000);
  const tot = (t: { food: number; toxin: number }) => t.food + t.toxin;
  const debut = r.parTranche.slice(0, 2);
  const fin = r.parTranche.slice(-2);
  const ratio = (ts: typeof debut) =>
    ts.reduce((s, t) => s + t.toxin, 0) / Math.max(1, ts.reduce((s, t) => s + tot(t), 0));
  // observé : ___ → ___
  expect(ratio(fin)).toBeLessThan(ratio(debut) * SEUIL_TOXINE);
}, 1_800_000);

it("apprend sur d'autres graines", () => {
  for (const seed of [2, 3]) {
    const r = experience(2500, seed, 400_000);
    expect(median(r.second)).toBeGreaterThan(median(r.first) * SEUIL_VIE);
  }
}, 3_600_000);
```

`SEUIL_VIE` et `SEUIL_TOXINE` sont des constantes locales au fichier de test, commentées avec
la valeur observée qui les justifie. Les `___` ci-dessus **doivent** être remplis.

- [ ] **Étape 5 : lancer la porte**

Commande : `npx vitest run src/sim/apprentissage.probe.test.ts`
Attendu : SUCCÈS, 3 tests.

- [ ] **Étape 6 : lancer la suite complète**

Commande : `npm test`
Attendu : tous les tests verts, y compris les 40+ fichiers existants de `src/lib/`. **Aucun
test existant ne doit avoir changé** — `src/sim/` est un ajout pur.

- [ ] **Étape 7 : commit**

```bash
git add src/sim/apprentissage.probe.test.ts src/sim/params.ts docs/superpowers/notes/2026-07-30-vie-calibration.md
git commit -m "test(vie): preuve d'apprentissage — durée de vie et ratio toxine mesurés"
```

---

## Fin du lot 1 : critère de sortie

Le lot est terminé quand, et seulement quand :

1. `npm test` est vert, y compris les sondes (`*.probe.test.ts`).
2. La porte de calibration (tâche 3) passe **avec** plasticité active.
3. La porte d'apprentissage (tâche 9) passe sur trois graines, avec des seuils qui citent une
   valeur observée.
4. `docs/superpowers/notes/2026-07-30-vie-calibration.md` contient : paramètres finaux, taux
   de décharge mesuré, débit en ticks/s à 2,5k / 10k / 50k, cadence de décision, et la table
   de progression par tranche.
5. Aucun fichier de `src/lib/` ni de `src/app/theorie/` n'a été modifié.

Ce qui n'est **pas** dans ce lot, et ne doit pas y entrer : le worker, le rendu three.js, les
protocoles gelé/yoked/lésion, la page d'accueil. Si le travail dérive vers ces sujets,
s'arrêter et le signaler.
