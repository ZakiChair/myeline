# Lot 0 — L'horloge, la portabilité et les préalables

> **Pour les agents exécutants :** COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour
> exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe `- [ ]` pour le suivi.

**Objectif :** rendre le noyau `src/sim/` reproductible au bit près **entre machines**, faire de `dt`
un paramètre exprimé en secondes, remplacer le bruit Box–Muller qui consomme 52 à 88 % du budget par
tick, et rendre les témoins d'apprentissage interprétables — avant d'écrire la moindre ligne
d'anatomie d'abeille.

**Architecture :** aucune fonctionnalité nouvelle. Quatre chantiers qui **invalident tous la
calibration**, donc groupés pour ne payer la recalibration qu'une fois. Le principe directeur, et
c'est un écart assumé vis-à-vis de la conception : **on n'écrit pas de bibliothèque mathématique
portable, on élimine les fonctions transcendantes du chemin d'état persistant.** Chacune peut être
supprimée par restructuration — c'est moins de code, plus rapide, et exact au lieu d'approché.

**Pile technique :** TypeScript, Vitest, Node 26 et Bun 1.3 (les deux moteurs servent de porte de
portabilité), typed arrays. Aucune dépendance nouvelle.

## Contraintes globales

- **Langue : français** pour tous les commentaires, noms de tests et messages de commit.
- **Chaque chiffre écrit dans un commentaire, un test ou le journal porte son statut** : mesuré,
  publié, calculé, ou inventé. C'est le standard du projet — voir
  `docs/superpowers/notes/2026-07-30-vie-calibration.md`.
- **Spécification de référence :** `docs/superpowers/specs/2026-07-30-myeline-abeille-design.md`.
- **Le mot « abeille » ne doit apparaître nulle part** dans le code ou l'interface avant le lot 3
  (décision de Zaki). Ce lot ne touche à aucun nom de région.
- **`src/lib/` et `src/app/theorie/` sont INTACTS.** Ce sont les archives du projet.
- **Aucune fonction transcendante (`Math.exp`, `log`, `cos`, `sin`, `atan2`, `hypot`, `cbrt`) ne doit
  subsister dans un chemin exécuté à chaque tick** à la fin de ce lot. Les seules autorisées sont
  `Math.sqrt`, `Math.abs`, `Math.min`, `Math.max`, `Math.round`, `Math.floor` — toutes exactement
  spécifiées par ECMAScript.
- **Ordre du tick de `stepLif` inchangé** (`lif.ts:4-12`) : c'est documenté comme non négociable et
  ça le reste.
- Tests : `npm test`. Le noyau compte 205 tests verts avant ce lot ; aucun ne doit disparaître sans
  qu'une ligne du plan le dise explicitement.

## Ce que ce lot NE fait PAS

Pas d'anatomie, pas de cellules de Kenyon, pas d'inhibition de rétroaction, pas de banc de tâches,
pas de nouvelle région. Ce lot rend le socle digne de confiance ; le lot 1 construit dessus.

---

## Structure des fichiers

| Fichier | Responsabilité | Action |
|---|---|---|
| `src/sim/params.ts` | constantes **en secondes** + résolution vers les ticks | modifier |
| `src/sim/temps.ts` | conversion secondes → ticks, plancher, avertissements | **créer** |
| `src/sim/bruit.ts` | table gaussienne déterministe et son vecteur d'or | **créer** |
| `src/sim/lif.ts` | consomme `bruit.ts` au lieu de Box–Muller | modifier |
| `src/sim/topology.ts` | consomme `bruit.ts` ; `Math.cbrt` remplacé | modifier |
| `src/sim/world.ts` | cap en **vecteur unitaire**, secteurs par produit scalaire, plus aucune transcendante | modifier |
| `src/sim/organism.ts` | homéostasie explicitement pilotable | modifier |
| `src/sim/metrics.ts` | mesure de la dérive des poids | modifier |
| `tools/porte-portabilite.mjs` | exécute l'organisme sous Node et Bun, compare les empreintes | **créer** |

Le découpage suit la responsabilité, pas la couche : `temps.ts` et `bruit.ts` sont deux préoccupations
transverses qui n'ont rien à faire dans `params.ts`, lequel dépasserait sinon 400 lignes.

---

## Tâche 1 : rendre l'homéostasie pilotable et mesurer la dérive des poids

**Pourquoi d'abord :** tant que le témoin « gelé » n'est pas caractérisé, aucune porte n'est
interprétable. Et le diagnostic du journal (l'homéostasie produit 93 à 96 % du mouvement synaptique)
n'est aujourd'hui écrit **nulle part dans un test** — il peut donc régresser sans que rien ne le dise.

⚠️ **Nuance importante, qui corrige la spécification.** La spécification dit « conditionner
l'homéostasie par `lr` ». C'est trop brutal : cela ferait du témoin gelé un **modèle différent**
(sans mécanisme de stabilité), et pas « le même modèle sans apprentissage ». Il existe deux témoins
distincts et légitimes, et il faut pouvoir exprimer **les deux** :

- **gelé-apprentissage** (`lr = 0`, homéostasie **active**) : isole la contribution de la règle ;
- **gelé-total** (`lr = 0`, homéostasie **coupée**) : aucun poids ne bouge.

**Fichiers :**
- Modifier : `src/sim/organism.ts:39-47` (options), `src/sim/organism.ts:121-123` (appel)
- Modifier : `src/sim/metrics.ts` (ajout de la mesure de dérive)
- Test : `src/sim/organism.test.ts`

**Interfaces :**
- Produit : `OrganismOptions.homeostasis?: boolean` (défaut `true` — rétro-compatible) ;
  `derivePoids(topo: Topology, reference: Float32Array): { moyenne: number; bougees: number }`
  exporté depuis `src/sim/metrics.ts`.

- [ ] **Étape 1 : écrire le test qui échoue**

Dans `src/sim/organism.test.ts`, ajouter :

```typescript
import { derivePoids } from "./metrics";

describe("témoins de plasticité", () => {
  /** Copie des poids, pour mesurer la dérive après coup. */
  const copiePoids = (org: Organism) => Float32Array.from(org.brain.topo.w);

  it("gelé-total : aucun poids ne bouge quand lr = 0 ET l'homéostasie est coupée", () => {
    const p = { ...ORGANISME_DEFAUT, brain: { ...ORGANISME_DEFAUT.brain,
      topology: { ...TOPOLOGIE_DEFAUT, n: 2500, seed: 4 } } };
    const org = createOrganism(p, { lr: 0, homeostasis: false });
    const avant = copiePoids(org);
    runOrganism(org, 3000, mulberry32(7));
    const d = derivePoids(org.brain.topo, avant);
    expect(d.bougees).toBe(0);
    expect(d.moyenne).toBe(0);
  }, 300_000);

  it("gelé-apprentissage : l'homéostasie SEULE déplace les poids, même à lr = 0", () => {
    // Épingle le diagnostic MESURÉ du 2026-07-30 : l'homéostasie produit 93 à 96 % du
    // mouvement synaptique. Sans ce test, ce fait peut régresser en silence.
    const p = { ...ORGANISME_DEFAUT, brain: { ...ORGANISME_DEFAUT.brain,
      topology: { ...TOPOLOGIE_DEFAUT, n: 2500, seed: 4 } } };
    const org = createOrganism(p, { lr: 0, homeostasis: true });
    const avant = copiePoids(org);
    runOrganism(org, 3000, mulberry32(7));
    const d = derivePoids(org.brain.topo, avant);
    expect(d.bougees).toBeGreaterThan(0);
    expect(d.moyenne).toBeGreaterThan(0);
  }, 300_000);
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `npx vitest run src/sim/organism.test.ts -t "témoins de plasticité"`
Attendu : ÉCHEC — `derivePoids` n'existe pas, et `homeostasis` n'est pas une option reconnue.

- [ ] **Étape 3 : ajouter la mesure de dérive**

Dans `src/sim/metrics.ts`, à la fin du fichier :

```typescript
/**
 * Dérive des poids depuis un instantané de référence. `bougees` compte les arêtes dont le
 * poids a changé ; `moyenne` est la dérive absolue moyenne PAR ARÊTE (sur toutes les arêtes,
 * pas seulement celles qui ont bougé).
 */
export function derivePoids(
  topo: { e: number; w: Float32Array },
  reference: Float32Array,
): { moyenne: number; bougees: number } {
  if (reference.length !== topo.e) {
    throw new Error(`référence de taille ${reference.length}, attendu ${topo.e}`);
  }
  let somme = 0;
  let bougees = 0;
  for (let e = 0; e < topo.e; e++) {
    const d = Math.abs(topo.w[e] - reference[e]);
    if (d > 0) bougees++;
    somme += d;
  }
  return { moyenne: somme / topo.e, bougees };
}
```

- [ ] **Étape 4 : rendre l'homéostasie pilotable**

Dans `src/sim/organism.ts`, ajouter au bloc `OrganismOptions` (après `lesion`) :

```typescript
  /**
   * Coupe la mise à l'échelle homéostatique. Défaut : true (active).
   *
   * DEUX TÉMOINS DISTINCTS, et il faut pouvoir exprimer les deux :
   *   - gelé-APPRENTISSAGE : lr = 0, homeostasis = true  → isole la règle à trois facteurs ;
   *   - gelé-TOTAL         : lr = 0, homeostasis = false → aucun poids ne bouge.
   * Le journal du 2026-07-30 a mesuré que l'homéostasie produit 93 à 96 % du mouvement
   * synaptique : confondre les deux témoins rendait la comparaison ininterprétable.
   */
  homeostasis?: boolean;
```

Puis remplacer `src/sim/organism.ts:121-123` :

```typescript
  if (org.options.homeostasis !== false && org.brain.lif.t % plast.homeoEvery === 0) {
    homeostasis(org.brain.topo, org.brain.lif, org.brain.plast, plast, TAUX_HOMEO);
  }
```

- [ ] **Étape 5 : lancer les tests et vérifier qu'ils passent**

Lancer : `npx vitest run src/sim/organism.test.ts`
Attendu : PASS, et les tests préexistants du fichier restent verts (le défaut `true` préserve le
comportement).

- [ ] **Étape 6 : lancer la suite complète**

Lancer : `npm test`
Attendu : 205 tests verts + les 2 nouveaux = 207.

- [ ] **Étape 7 : commit**

```bash
git add src/sim/organism.ts src/sim/metrics.ts src/sim/organism.test.ts
git commit -m "feat(sim): deux témoins distincts — gelé-apprentissage et gelé-total

L'homéostasie devient explicitement pilotable (option homeostasis, défaut true).
La spécification proposait de la conditionner par lr : trop brutal, cela ferait du
témoin un modèle différent au lieu du même modèle sans apprentissage.

derivePoids() épingle en test le diagnostic mesuré du 2026-07-30 — l'homéostasie
produit 93 à 96 % du mouvement synaptique — pour qu'il ne puisse plus régresser en
silence."
```

---

## Tâche 2 : éliminer les transcendantes de `world.ts`

**Pourquoi :** c'est **le seul module** qui casse la reproductibilité entre moteurs. Mesuré en
exécutant le même bundle sous V8 et sous JSC : le réseau est bit-identique à n = 50 000 sur
400 000 ticks, l'organisme complet diverge dès le tick ≈ 17 942, avec un écart final de 89,6 unités
dans une arène de demi-côté 80.

**L'idée directrice :** ne pas réimplémenter `cos`, `sin`, `atan2`, `hypot` — **les supprimer**.

| Appel actuel | À quoi il sert vraiment | Remplacement exact |
|---|---|---|
| `Math.hypot(dx, dy)` × 7 | une distance | `Math.sqrt(dx*dx + dy*dy)` — `sqrt` est **exactement spécifié** |
| `Math.atan2` (`world.ts:117`) | trouver un **indice de secteur entier** | produit scalaire maximal contre les directions centrales précalculées |
| `Math.cos/sin(heading)` (`world.ts:194-195`) | avancer selon le cap | le cap **est** un vecteur unitaire `(hx, hy)` ; avancer = `x += hx * stepLen` |
| `heading += turnStep` | tourner | rotation par une paire `(C, S)` littérale : 4 multiplications |
| `rng() * 2 * Math.PI` puis cos/sin | une direction aléatoire | tirage par rejet dans le disque unité, puis normalisation |

Aucune approximation n'est introduite : chaque remplacement est soit exact, soit une reformulation
du même calcul en arithmétique élémentaire.

**Fichiers :**
- Modifier : `src/sim/world.ts` (intégralement — `WorldState`, `deposer`, `angleRelatif`, `emettre`,
  `sense`, `stepWorld`)
- Modifier : `src/sim/params.ts` (ajout de deux constantes de rotation)
- Test : `src/sim/world.test.ts`

**Interfaces :**
- Consomme : rien des tâches précédentes.
- Produit : `WorldState` perd `heading: number` et gagne `hx: number` et `hy: number` (cap en vecteur
  unitaire). `src/sim/world.test.ts` et tout appelant lisant `w.heading` doivent suivre —
  `grep -rn "heading" src/` avant de commencer.

- [ ] **Étape 1 : écrire le test qui échoue**

Dans `src/sim/world.test.ts`, ajouter :

```typescript
describe("portabilité : aucune fonction transcendante", () => {
  it("n'appelle aucune transcendante dans un pas de monde", () => {
    // Test STRUCTUREL : on piège les fonctions non spécifiées au bit près par ECMAScript.
    // Un test de valeur ne les attraperait pas — elles donnent le bon résultat, juste pas
    // les mêmes bits selon le moteur.
    const pieges = ["exp", "log", "cos", "sin", "atan2", "hypot", "cbrt", "tan", "asin", "acos"] as const;
    const originaux = pieges.map((n) => [n, Math[n]] as const);
    const appels: string[] = [];
    for (const [n] of originaux) {
      // @ts-expect-error remplacement volontaire pour la durée du test
      Math[n] = (...a: number[]) => { appels.push(n); return originaux.find(([m]) => m === n)![1](...a); };
    }
    try {
      const w = createWorld(MONDE_DEFAUT, mulberry32(3));
      const rng = mulberry32(9);
      for (let k = 0; k < 500; k++) {
        sense(w, MONDE_DEFAUT);
        stepWorld(w, MONDE_DEFAUT, k % 3 === 0 ? "AVANCER" : k % 3 === 1 ? "GAUCHE" : "DROITE", rng);
      }
    } finally {
      // @ts-expect-error restauration
      for (const [n, f] of originaux) Math[n] = f;
    }
    expect(appels).toEqual([]);
  });

  it("garde le cap sur le cercle unité sur 20 000 pas", () => {
    // Une rotation répétée fait dériver la norme si C² + S² ≠ 1 exactement en flottant.
    const w = createWorld(MONDE_DEFAUT, mulberry32(3));
    const rng = mulberry32(9);
    for (let k = 0; k < 20_000; k++) stepWorld(w, MONDE_DEFAUT, "GAUCHE", rng);
    expect(Math.sqrt(w.hx * w.hx + w.hy * w.hy)).toBeCloseTo(1, 6);
  }, 60_000);

  it("dépose dans le même secteur que le calcul par angle", () => {
    // Équivalence avec l'ancienne formule, sur 360 directions.
    const S = SECTEURS_OLF;
    for (let deg = 0; deg < 360; deg++) {
      const a = (deg * Math.PI) / 180 - Math.PI;
      const attendu = ((Math.round(a / ((2 * Math.PI) / S)) % S) + S) % S;
      expect(secteurDe(Math.cos(a), Math.sin(a), S)).toBe(attendu);
    }
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `npx vitest run src/sim/world.test.ts -t "portabilité"`
Attendu : ÉCHEC — `secteurDe` n'existe pas, `w.hx` est `undefined`, et le piège relève des appels à
`hypot`, `atan2`, `cos`, `sin`.

- [ ] **Étape 3 : ajouter les constantes de rotation**

Dans `src/sim/params.ts`, dans `WorldParams`, remplacer `turnStep` par la paire de rotation et
documenter pourquoi :

```typescript
  /**
   * Rotation par action, sous forme de cosinus et sinus PRÉCALCULÉS.
   *
   * On ne stocke plus un angle : `Math.cos`/`Math.sin` ne sont pas spécifiés au bit près par
   * ECMAScript et faisaient diverger l'organisme entre moteurs dès le tick ≈ 17 942 (mesuré,
   * V8 contre JSC). Un cap en vecteur unitaire tourné par une matrice littérale n'utilise que
   * des multiplications et des additions, exactement spécifiées.
   *
   * Valeurs pour 0,06 rad, l'angle mesuré à la tâche 7 du lot 1.
   */
  turnCos: number;
  turnSin: number;
```

et dans `MONDE_DEFAUT`, remplacer `turnStep: 0.06` par :

```typescript
  turnCos: 0.9982004566991221,  // cos(0,06)
  turnSin: 0.05996400647918015, // sin(0,06)
```

- [ ] **Étape 4 : réécrire les primitives géométriques de `world.ts`**

Remplacer `deposer`, `angleRelatif` et l'entête de `WorldState` :

```typescript
/** Directions centrales des secteurs, précalculées par nombre de secteurs. */
const CENTRES = new Map<number, { cx: Float32Array; cy: Float32Array }>();
function centres(secteurs: number) {
  let c = CENTRES.get(secteurs);
  if (!c) {
    // Construit UNE fois, stocké en Float32Array : l'arrondi f32 efface les écarts
    // inter-moteurs de Math.cos/sin (mesuré : 6,94 % des tirages diffèrent en double,
    // 0 sur 10^7 survivent à l'arrondi f32).
    const cx = new Float32Array(secteurs);
    const cy = new Float32Array(secteurs);
    for (let k = 0; k < secteurs; k++) {
      const a = (2 * Math.PI * k) / secteurs;
      cx[k] = Math.cos(a);
      cy[k] = Math.sin(a);
    }
    c = { cx, cy };
    CENTRES.set(secteurs, c);
  }
  return c;
}

/**
 * Secteur d'une direction (rx, ry) exprimée dans le repère de l'organisme. Le secteur retenu
 * est celui dont la direction centrale maximise le produit scalaire — strictement équivalent à
 * `round(atan2(ry, rx) / pas)`, sans atan2. L'échelle de (rx, ry) n'a pas d'importance : elle
 * est positive et multiplie tous les produits scalaires de la même façon.
 */
export function secteurDe(rx: number, ry: number, secteurs: number): number {
  const { cx, cy } = centres(secteurs);
  let best = 0;
  let bestDot = rx * cx[0] + ry * cy[0];
  for (let k = 1; k < secteurs; k++) {
    const d = rx * cx[k] + ry * cy[k];
    if (d > bestDot) { bestDot = d; best = k; }
  }
  return best;
}

/** Direction du point (px, py) dans le repère de l'organisme : rotation par −cap. */
function relatif(w: WorldState, px: number, py: number): { rx: number; ry: number; d: number } {
  const dx = px - w.x;
  const dy = py - w.y;
  return {
    rx: dx * w.hx + dy * w.hy,
    ry: dy * w.hx - dx * w.hy,
    d: Math.sqrt(dx * dx + dy * dy),
  };
}

function deposer(canal: Float32Array, rx: number, ry: number, intensite: number, secteurs: number): void {
  const idx = secteurDe(rx, ry, secteurs);
  const gauche = (idx + secteurs - 1) % secteurs;
  const droite = (idx + 1) % secteurs;
  if (intensite > canal[idx]) canal[idx] = intensite;
  const flanc = intensite * 0.5;
  if (flanc > canal[gauche]) canal[gauche] = flanc;
  if (flanc > canal[droite]) canal[droite] = flanc;
}
```

Dans `WorldState`, remplacer `heading: number;` par :

```typescript
  /** Cap, en VECTEUR UNITAIRE. Voir params.ts (turnCos/turnSin) pour le pourquoi. */
  hx: number;
  hy: number;
```

et dans `createWorld`, remplacer `heading: 0` par `hx: 1, hy: 0` (cap vers +x, équivalent à l'ancien
`heading = 0`).

- [ ] **Étape 5 : réécrire `emettre`, `sense` et `stepWorld`**

`emettre` devient (le calcul de distance et la direction viennent du même appel) :

```typescript
function emettre(
  canal: Float32Array, w: WorldState, xs: Float32Array, ys: Float32Array,
  cd: Int32Array, portee: number, secteurs: number,
): void {
  for (let i = 0; i < xs.length; i++) {
    if (cd[i] > 0) continue;
    const r = relatif(w, xs[i], ys[i]);
    if (r.d >= portee) continue;
    deposer(canal, r.rx, r.ry, 1 - r.d / portee, secteurs);
  }
}
```

Dans `sense`, remplacer les trois blocs restants — prédateur, murs — sur le même modèle :

```typescript
  const rp = relatif(w, w.predX, w.predY);
  if (rp.d < p.alarmRange) {
    deposer(alarm, rp.rx, rp.ry, 1 - rp.d / p.alarmRange, SECTEURS_ALARM);
  }

  const contact = p.foodRadius * 2;
  for (const [mx, my] of [[p.arena, w.y], [-p.arena, w.y], [w.x, p.arena], [w.x, -p.arena]] as const) {
    const r = relatif(w, mx, my);
    if (r.d >= contact) continue;
    deposer(soma, r.rx, r.ry, 1 - r.d / contact, SECTEURS_SOMA);
  }
```

Dans `stepWorld`, l'action devient une rotation ou une translation, **suivie d'une renormalisation** :

```typescript
  let bouge = false;
  if (action === "GAUCHE" || action === "DROITE") {
    const s = action === "GAUCHE" ? p.turnSin : -p.turnSin;
    const nx = w.hx * p.turnCos - w.hy * s;
    const ny = w.hx * s + w.hy * p.turnCos;
    // Renormalisation : sans elle, la norme dérive exponentiellement, car turnCos² + turnSin²
    // ne vaut pas exactement 1 en flottant. sqrt et la division sont exactement spécifiés.
    const inv = 1 / Math.sqrt(nx * nx + ny * ny);
    w.hx = nx * inv;
    w.hy = ny * inv;
  } else if (action === "AVANCER") {
    w.x = clamp(w.x + w.hx * p.stepLen, p.arena);
    w.y = clamp(w.y + w.hy * p.stepLen, p.arena);
    bouge = true;
  }
```

Les six `Math.hypot` restants de `stepWorld` (collisions, prédateur) deviennent
`Math.sqrt(dx*dx + dy*dy)` en ligne. Et les deux directions aléatoires du prédateur
(`world.ts:233` et `world.ts:243`) deviennent un tirage par rejet :

```typescript
/** Direction aléatoire uniforme, sans trigonométrie : rejet dans le disque unité. */
function directionAleatoire(rng: RNG): { dx: number; dy: number } {
  for (;;) {
    const u = rng() * 2 - 1;
    const v = rng() * 2 - 1;
    const q = u * u + v * v;
    if (q > 1e-12 && q <= 1) {
      const inv = 1 / Math.sqrt(q);
      return { dx: u * inv, dy: v * inv };
    }
  }
}
```

- [ ] **Étape 6 : lancer les tests et vérifier qu'ils passent**

Lancer : `npx vitest run src/sim/world.test.ts`
Attendu : PASS pour les 3 nouveaux tests. **Les tests préexistants de `world.test.ts` qui lisent
`w.heading` échouent** : les mettre à jour pour lire `w.hx`/`w.hy`. C'est attendu et voulu —
la dynamique change, Zaki l'a accepté (décision n° 4).

- [ ] **Étape 7 : lancer la suite complète**

Lancer : `npm test`
Attendu : les tests de `world`, `organism` et `brain` qui épinglaient des trajectoires ou des
comptages d'événements **échouent**. Les valeurs attendues doivent être **remesurées**, pas ajustées
à la main jusqu'à ce que ça passe. Pour chaque test modifié, écrire en commentaire la valeur
nouvelle et la date de la mesure.

- [ ] **Étape 8 : commit**

```bash
git add src/sim/world.ts src/sim/params.ts src/sim/world.test.ts src/sim/organism.test.ts src/sim/brain.test.ts
git commit -m "fix(sim): supprimer les transcendantes de world.ts plutôt que les réimplémenter

world.ts était le SEUL module cassant la reproductibilité entre moteurs (mesuré : le
réseau est bit-identique V8/JSC à n = 50 000 sur 400 000 ticks, l'organisme diverge dès
le tick ~17 942).

Aucune bibliothèque mathématique portable n'a été écrite : chaque transcendante est
ÉLIMINÉE par restructuration, ce qui est exact au lieu d'approché.
- hypot -> sqrt (exactement spécifié)
- atan2 -> indice de secteur par produit scalaire maximal, strictement équivalent
- cos/sin du cap -> le cap EST un vecteur unitaire, tourné par une paire littérale
- direction aléatoire -> tirage par rejet dans le disque unité

Le cap est renormalisé à chaque rotation : sans cela la norme dérive exponentiellement.

La dynamique change, donc les valeurs épinglées ont été REMESURÉES, jamais ajustées."
```

---

## Tâche 3 : le bruit gaussien par table, avec vecteur d'or

**Pourquoi :** mesuré, le Box–Muller consomme **52 à 61 % du budget par tick** à n = 50 000 et **88 %
à l'échelle anatomique complète**, parce que le coût est en O(n) et non en O(arêtes). Le remplacer
donne **×3,45 mesuré** sur `stepLif` (780 → 2 693 ticks/s à n = 50 000). Sans ce changement,
l'exigence d'échelle complète de Zaki n'est pas atteignable.

**Fichiers :**
- Créer : `src/sim/bruit.ts`
- Créer : `src/sim/bruit.test.ts`
- Modifier : `src/sim/lif.ts:42-45` et `:95` ; `src/sim/topology.ts:63-66`

**Interfaces :**
- Produit : `tableGauss(): Float32Array` (mémoïsée) et `gaussTable(rng: RNG): number` depuis
  `src/sim/bruit.ts`. `gaussTable` consomme **un** appel RNG (contre deux pour Box–Muller) : le flux
  du RNG change, donc la dynamique change. C'est accepté (décision n° 4).

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `src/sim/bruit.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { tableGauss, gaussTable, EMPREINTE_TABLE } from "./bruit";

describe("bruit gaussien par table", () => {
  it("a les moments d'une gaussienne centrée réduite", () => {
    const t = tableGauss();
    let s = 0, s2 = 0;
    for (let k = 0; k < t.length; k++) { s += t[k]; s2 += t[k] * t[k]; }
    expect(s / t.length).toBeCloseTo(0, 2);
    expect(Math.sqrt(s2 / t.length)).toBeCloseTo(1, 2);
  });

  it("a une taille qui rend la réutilisation négligeable à grande échelle", () => {
    // À n = 10^6, une table de 2^16 serait relue ~15 fois par tick. 2^20 ramène à ~1.
    expect(tableGauss().length).toBe(1 << 20);
  });

  it("est déterministe pour une graine donnée", () => {
    const tire = () => { const r = mulberry32(5); return Array.from({ length: 200 }, () => gaussTable(r)); };
    expect(tire()).toEqual(tire());
  });

  it("consomme exactement un appel RNG par tirage", () => {
    let appels = 0;
    const r = mulberry32(5);
    const compte = () => { appels++; return r(); };
    for (let k = 0; k < 100; k++) gaussTable(compte);
    expect(appels).toBe(100);
  });

  it("VECTEUR D'OR : la table a exactement les mêmes bits qu'au jour de sa création", () => {
    // La table est construite avec Math.log/Math.cos, qui ne sont PAS spécifiés au bit près.
    // Le stockage en Float32Array absorbe l'écart (mesuré : 0 différence sur 10^7 tirages),
    // mais c'est une garantie PROBABILISTE. Ce test la rend VÉRIFIABLE : si un moteur ou une
    // version future casse l'hypothèse, il échoue bruyamment au lieu de corrompre un run.
    expect(empreinte(tableGauss())).toBe(EMPREINTE_TABLE);
  });
});

/** Empreinte FNV-1a sur les bits bruts, en arithmétique entière exacte. */
function empreinte(t: Float32Array): number {
  const octets = new Uint8Array(t.buffer, t.byteOffset, t.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < octets.length; i++) h = Math.imul(h ^ octets[i], 0x01000193);
  return h >>> 0;
}
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `npx vitest run src/sim/bruit.test.ts`
Attendu : ÉCHEC — le module `./bruit` n'existe pas.

- [ ] **Étape 3 : écrire `src/sim/bruit.ts`**

```typescript
// Bruit gaussien par table précalculée.
//
// POURQUOI : le Box–Muller de lif.ts:42-45 appelle Math.log et Math.cos pour CHAQUE neurone à
// CHAQUE tick. Mesuré le 2026-07-30 : 22,44 ns par tirage, soit 52 à 61 % du budget par tick à
// n = 50 000, et 88 % à l'échelle anatomique complète — parce que ce coût est en O(n) et non en
// O(arêtes). La table le ramène à 1,10 ns, soit ×3,45 sur stepLif (mesuré, 780 → 2 693 ticks/s).
//
// DÉTERMINISME : Math.log et Math.cos ne sont pas spécifiés au bit près par ECMAScript (6,94 %
// des tirages diffèrent entre V8 et JSC en double précision). Le stockage en Float32Array efface
// l'écart — 0 différence sur 10^7 tirages mesurés — mais c'est une garantie probabiliste. Le
// vecteur d'or de bruit.test.ts la rend vérifiable.

import type { RNG } from "../lib/rng";
import { mulberry32 } from "../lib/rng";

/** 2^20 entrées = 4 Mo. À n = 10^6, chaque entrée est relue ~1 fois par tick. */
const TAILLE = 1 << 20;

/** Empreinte FNV-1a de la table, MESURÉE à sa création. Voir bruit.test.ts. */
export const EMPREINTE_TABLE = 0; // ← à remplacer par la valeur mesurée, étape 5

let table: Float32Array | null = null;

export function tableGauss(): Float32Array {
  if (table !== null) return table;
  const t = new Float32Array(TAILLE);
  const rng = mulberry32(0x9e3779b9);
  for (let k = 0; k < TAILLE; k++) {
    const u = Math.max(rng(), 1e-12);
    t[k] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }
  table = t;
  return t;
}

/**
 * Un tirage gaussien. UN seul appel RNG (contre deux pour Box–Muller) : le flux du RNG change
 * donc, et avec lui la dynamique. Changement accepté au lot 0, où toute la calibration est
 * refaite de toute façon.
 */
export function gaussTable(rng: RNG): number {
  return tableGauss()[(rng() * TAILLE) | 0];
}
```

- [ ] **Étape 4 : brancher `lif.ts` et `topology.ts`**

Dans `src/sim/lif.ts`, supprimer la fonction locale `gauss` (lignes 41-45) et importer :

```typescript
import { gaussTable } from "./bruit";
```

puis à la ligne 95, remplacer `p.noise * gauss(rng)` par `p.noise * gaussTable(rng)`.

Faire de même dans `src/sim/topology.ts` (supprimer `gauss` lignes 62-66, importer `gaussTable`,
remplacer les trois appels `gauss(rng)` par `gaussTable(rng)`).

- [ ] **Étape 5 : mesurer l'empreinte et l'inscrire**

Lancer : `npx vitest run src/sim/bruit.test.ts -t "VECTEUR D'OR"`
Le test échoue et affiche la valeur reçue. **Reporter cette valeur dans `EMPREINTE_TABLE`**, avec un
commentaire donnant la date et le moteur de la mesure. Relancer : PASS.

- [ ] **Étape 6 : mesurer le gain de débit**

Créer un banc jetable **hors du dépôt**, dans le scratchpad de session, qui mesure `stepLif` à
n = 50 000 sur 400 ticks, avant et après. Attendu d'après la mesure du 2026-07-30 : **au moins ×2,5**.
Consigner le chiffre obtenu ; il servira à la porte (b) du lot 0.

- [ ] **Étape 7 : lancer la suite complète**

Lancer : `npm test`
Attendu : de nombreux tests de dynamique échouent (le flux du RNG a changé). **Remesurer**, ne pas
ajuster à la main.

- [ ] **Étape 8 : commit**

```bash
git add src/sim/bruit.ts src/sim/bruit.test.ts src/sim/lif.ts src/sim/topology.ts src/sim/*.test.ts
git commit -m "perf(sim): bruit gaussien par table — le poste le plus lourd du tick

Mesuré le 2026-07-30 : le Box-Muller consomme 52 à 61 % du budget par tick à
n = 50 000 et 88 % à l'échelle anatomique complète, parce que son coût est en O(n) et
non en O(arêtes). Le journal (tâche 8) raisonnait comme si les arêtes gouvernaient la
montée en échelle : c'est faux.

Table de 2^20 entrées (4 Mo) : ~1 relecture par entrée et par tick à n = 10^6, contre
~15 pour 2^16. Un vecteur d'or épingle ses bits, parce que la portabilité de la
construction (Math.log/Math.cos absorbés par l'arrondi f32) est une garantie
PROBABILISTE et doit donc être vérifiable."
```

---

## Tâche 4 : les constantes en secondes, `dt` en paramètre

**Pourquoi :** mesuré et calculé — le rapport `tauElig / tauM` vaut **3** dans le noyau contre **50 à
1 000** en biologie, et **≈ 150** chez l'abeille (intervalle CS-US optimal ≈ 3 s, membrane ≈ 20 ms).
La fenêtre de crédit est donc **environ 50 fois trop courte**. Tant que les constantes sont écrites
en ticks, ce défaut est invisible : rien ne dit ce qu'un tick vaut.

**Fichiers :**
- Créer : `src/sim/temps.ts`, `src/sim/temps.test.ts`
- Modifier : `src/sim/params.ts`

**Interfaces :**
- Produit : `DT_DEFAUT = 0.001` ; `enTicks(secondes: number, dt: number, nom: string, avert: string[]): number` ;
  `LIF_SECONDES`, `PLASTICITE_SECONDES` ; `resoudreLif(sec, dt)` et `resoudrePlasticite(sec, dt)`
  renvoyant `{ params, avertissements }`.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `src/sim/temps.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import { DT_DEFAUT, enTicks, resoudreLif, LIF_SECONDES } from "./temps";
import { LIF_DEFAUT } from "./params";

describe("conversion secondes → ticks", () => {
  it("convertit exactement à dt = 1 ms", () => {
    const a: string[] = [];
    expect(enTicks(0.02, 0.001, "tauM", a)).toBe(20);
    expect(a).toEqual([]);
  });

  it("reproduit EXACTEMENT les constantes LIF actuelles à dt = 1 ms", () => {
    // Épinglage : le passage aux secondes ne doit RIEN changer à l'horloge de référence.
    const { params, avertissements } = resoudreLif(LIF_SECONDES, DT_DEFAUT);
    expect(params.tauM).toBe(LIF_DEFAUT.tauM);
    expect(params.tauS).toBe(LIF_DEFAUT.tauS);
    expect(params.tauThr).toBe(LIF_DEFAUT.tauThr);
    expect(params.refrac).toBe(LIF_DEFAUT.refrac);
    expect(avertissements).toEqual([]);
  });

  it("plancher à 1 tick, et AVERTIT en nommant chaque constante rabotée", () => {
    // À dt = 10 ms, le réfractaire (2 à 3 ms) et les délais axonaux (1 à 8 ms) tombent sous
    // le tick. Or lif.ts:11-12 documente comme NON NÉGOCIABLE qu'un délai vaille au moins 1 :
    // c'est ce qui rend « avant » et « après » distinguables, prérequis de la plasticité.
    const a: string[] = [];
    expect(enTicks(0.003, 0.01, "refrac", a)).toBe(1);
    expect(a).toHaveLength(1);
    expect(a[0]).toContain("refrac");
    expect(a[0]).toContain("0,3");
  });

  it("signale le réfractaire et les délais à dt = 10 ms", () => {
    const { avertissements } = resoudreLif(LIF_SECONDES, 0.01);
    expect(avertissements.join(" ")).toContain("refrac");
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `npx vitest run src/sim/temps.test.ts`
Attendu : ÉCHEC — le module `./temps` n'existe pas.

- [ ] **Étape 3 : écrire `src/sim/temps.ts`**

```typescript
// Le temps du modèle, exprimé en SECONDES et converti en ticks à la construction.
//
// POURQUOI : tant que les constantes sont écrites en ticks, rien ne dit ce qu'un tick vaut, et
// il est impossible de voir qu'elles sont incohérentes entre elles. Mesuré le 2026-07-30 :
// tauElig / tauM valait 3 dans le noyau, contre 50 à 1 000 en biologie et ≈ 150 chez l'abeille
// (intervalle CS-US optimal ≈ 3 s, publié ; membrane ≈ 20 ms). La fenêtre de crédit était donc
// environ 50 fois trop courte — ce qui réhabilite l'hypothèse que le journal avait classée
// « partiellement écartée ».
//
// dt = 1 ms pour les tests finaux, 10 ms pour le débogage (décision de Zaki, 2026-07-30).
// ⚠️ À 10 ms le réfractaire et les délais axonaux tombent sous le tick : ce mode vérifie que la
// plomberie tourne, il ne peut PAS servir à déboguer l'apprentissage.

import type { LifParams } from "./params";

/** Secondes par tick. 1 ms : la membrane vaut alors 20 ticks, valeur physiologique. */
export const DT_DEFAUT = 0.001;

/**
 * Convertit une durée en ticks. Plancher à 1 : une constante qui arrondirait à 0 casserait le
 * modèle en silence. Chaque rabotage est NOMMÉ dans `avertissements`.
 */
export function enTicks(secondes: number, dt: number, nom: string, avertissements: string[]): number {
  const brut = secondes / dt;
  const t = Math.round(brut);
  if (t < 1) {
    avertissements.push(
      `${nom} : ${secondes} s vaut ${brut.toFixed(1).replace(".", ",")} tick à dt = ${dt} s, ` +
        `porté au plancher de 1. Le modèle N'EST PAS physiologique à cette résolution.`,
    );
    return 1;
  }
  return t;
}

/** Constantes du neurone, en SECONDES. Ce sont elles la source de vérité. */
export const LIF_SECONDES = {
  tauM: 0.020,   // membrane, 20 ms
  tauS: 0.005,   // courant synaptique, 5 ms
  tauThr: 0.120, // relaxation du seuil, 120 ms
  refrac: 0.003, // réfractaire, 3 ms
  vRest: 0,
  vReset: 0,
  thrBase: 1,
  thrJump: 0.18,
  noise: 0.08,
};

export function resoudreLif(
  sec: typeof LIF_SECONDES,
  dt: number,
): { params: LifParams; avertissements: string[] } {
  const a: string[] = [];
  return {
    params: {
      tauM: enTicks(sec.tauM, dt, "tauM", a),
      tauS: enTicks(sec.tauS, dt, "tauS", a),
      tauThr: enTicks(sec.tauThr, dt, "tauThr", a),
      refrac: enTicks(sec.refrac, dt, "refrac", a),
      vRest: sec.vRest,
      vReset: sec.vReset,
      thrBase: sec.thrBase,
      thrJump: sec.thrJump,
      noise: sec.noise,
    },
    avertissements: a,
  };
}
```

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

Lancer : `npx vitest run src/sim/temps.test.ts`
Attendu : PASS, les 4 tests.

- [ ] **Étape 5 : porter `tauElig` à sa valeur physiologique**

Dans `src/sim/temps.ts`, ajouter `PLASTICITE_SECONDES` et `resoudrePlasticite` sur le même modèle,
avec `tauElig: 2.5` (secondes). **C'est le changement de fond de cette tâche** : à dt = 1 ms cela
fait 2 500 ticks au lieu de 60.

Conséquences à traiter dans le même commit :
- `plasticity.ts:49` dimensionne la LUT à `4 × tauElig + 1`, soit **10 001 entrées** au lieu de 241.
  Coût en O(τ), pas en O(arêtes) : négligeable. Vérifier qu'aucun test ne suppose la taille.
- `dumpEvery = 16` devient absurdement fréquent face à une fenêtre de 2 500 ticks. Le porter à
  **250 ticks** (soit un dixième de `tauElig`) et **mesurer** l'effet sur le débit — le journal avait
  mesuré le balayage dopaminergique à 17 % du temps à `dumpEvery = 16`.

- [ ] **Étape 6 : lancer la suite complète**

Lancer : `npm test`
Attendu : les tests de plasticité qui épinglaient des valeurs d'éligibilité échouent. Remesurer.

- [ ] **Étape 7 : commit**

```bash
git add src/sim/temps.ts src/sim/temps.test.ts src/sim/params.ts src/sim/plasticity.ts src/sim/*.test.ts
git commit -m "feat(sim): les constantes de temps passent en secondes, dt devient un paramètre

Le noyau n'avait AUCUNE base de temps cohérente : aucune valeur du tick ne rend ses
constantes simultanément plausibles. Le rapport tauElig/tauM valait 3 contre 50 à 1000
en biologie et ~150 chez l'abeille (ISI optimal ~3 s publié, membrane ~20 ms) — la
fenêtre de crédit était environ 50 FOIS trop courte.

Cela réhabilite l'hypothèse 2 du journal de calibration, qui la classait
« partiellement écartée » : elle n'était pas partiellement vraie, elle était vraie d'un
facteur 50, et le journal ne pouvait pas le voir faute d'unité de référence.

tauElig : 60 -> 2500 ticks (2,5 s). dumpEvery : 16 -> 250.

Plancher à 1 tick avec avertissement NOMMANT chaque constante rabotée : à dt = 10 ms le
réfractaire et les délais axonaux tombent sous le tick, or lif.ts documente le délai >= 1
comme prérequis NON NÉGOCIABLE de la distinction avant/après."
```

---

## Tâche 5 : la porte de portabilité Node / Bun

**Pourquoi :** c'est la porte (d) du lot 0, et c'est la seule qui vérifie ce que le projet croyait
déjà avoir. Sans elle, la reproductibilité entre machines resterait une intention.

**Fichiers :**
- Créer : `tools/porte-portabilite.mjs`
- Créer : `src/sim/portabilite.test.ts`

**Interfaces :**
- Consomme : `createOrganism`, `runOrganism` (tâche 1) ; le monde sans transcendantes (tâche 2) ;
  `gaussTable` (tâche 3).

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `src/sim/portabilite.test.ts` :

```typescript
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { createOrganism, runOrganism } from "./organism";
import { ORGANISME_DEFAUT, TOPOLOGIE_DEFAUT } from "./params";
import { empreinteOrganisme } from "./portabilite";

describe("empreinte de l'organisme", () => {
  it("est stable d'une exécution à l'autre sur le même moteur", () => {
    const faire = () => {
      const p = { ...ORGANISME_DEFAUT, brain: { ...ORGANISME_DEFAUT.brain,
        topology: { ...TOPOLOGIE_DEFAUT, n: 2500, seed: 4 } } };
      const org = createOrganism(p);
      runOrganism(org, 20_000, mulberry32(7));
      return empreinteOrganisme(org);
    };
    expect(faire()).toBe(faire());
  }, 120_000);
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `npx vitest run src/sim/portabilite.test.ts`
Attendu : ÉCHEC — `empreinteOrganisme` n'existe pas.

- [ ] **Étape 3 : écrire l'empreinte**

Créer `src/sim/portabilite.ts` :

```typescript
// Empreinte de l'état complet d'un organisme, pour comparer deux moteurs JavaScript.
//
// L'empreinte porte sur les BITS des tableaux typés, pas sur des valeurs arrondies : c'est le
// seul niveau où « reproductible au bit près » veut dire quelque chose.

import type { Organism } from "./organism";

function fnv(h: number, octets: Uint8Array): number {
  for (let i = 0; i < octets.length; i++) h = Math.imul(h ^ octets[i], 0x01000193);
  return h >>> 0;
}
const bits = (a: Float32Array | Int32Array | Uint8Array) =>
  new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

export function empreinteOrganisme(org: Organism): string {
  let h = 0x811c9dc5;
  h = fnv(h, bits(org.brain.topo.w));
  h = fnv(h, bits(org.brain.lif.v));
  h = fnv(h, bits(org.brain.lif.thr));
  h = fnv(h, bits(org.brain.lif.spikeTotal));
  h = fnv(h, bits(org.brain.plast.elig));
  // Le monde : ce sont ses flottants qui divergeaient entre moteurs.
  const monde = new Float64Array([org.world.x, org.world.y, org.world.hx, org.world.hy, org.world.energy]);
  h = fnv(h, new Uint8Array(monde.buffer));
  const compteurs = `${org.world.ateFood}/${org.world.ateToxin}/${org.world.hits}/${org.world.deaths}`;
  return `${h.toString(16).padStart(8, "0")}:${compteurs}`;
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `npx vitest run src/sim/portabilite.test.ts`
Attendu : PASS.

- [ ] **Étape 5 : écrire la porte deux-moteurs**

Créer `tools/porte-portabilite.mjs` :

```javascript
// Porte (d) du lot 0 : l'organisme complet doit donner un état identique AU BIT PRÈS sous deux
// moteurs JavaScript différents. Node utilise V8, Bun utilise JSC — le moteur de Safari, donc
// celui du navigateur cible.
//
// Méthode : le noyau est bundlé UNE SEULE FOIS, puis le MÊME fichier est exécuté sous les deux
// moteurs. Bundler deux fois masquerait une différence de compilation.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "porte-"));
const entree = join(dir, "entree.ts");
writeFileSync(entree, `
import { mulberry32 } from "./src/lib/rng";
import { createOrganism, runOrganism } from "./src/sim/organism";
import { ORGANISME_DEFAUT, TOPOLOGIE_DEFAUT } from "./src/sim/params";
import { empreinteOrganisme } from "./src/sim/portabilite";
const p = { ...ORGANISME_DEFAUT, brain: { ...ORGANISME_DEFAUT.brain,
  topology: { ...TOPOLOGIE_DEFAUT, n: 2500, seed: 4 } } };
const org = createOrganism(p);
runOrganism(org, 20000, mulberry32(7));
console.log(empreinteOrganisme(org));
`);

const bundle = join(dir, "bundle.mjs");
execFileSync("bun", ["build", entree, "--target=node", "--outfile", bundle], { stdio: "inherit" });

const sousNode = execFileSync("node", [bundle], { encoding: "utf8" }).trim();
const sousBun = execFileSync("bun", [bundle], { encoding: "utf8" }).trim();

console.log(`Node (V8) : ${sousNode}`);
console.log(`Bun  (JSC): ${sousBun}`);
if (sousNode !== sousBun) {
  console.error("\n❌ PORTE ÉCHOUÉE : les deux moteurs divergent.");
  process.exit(1);
}
console.log("\n✅ PORTE PASSÉE : état identique au bit près sous V8 et JSC.");
```

- [ ] **Étape 6 : lancer la porte**

Lancer : `node tools/porte-portabilite.mjs`
Attendu : `✅ PORTE PASSÉE`. **Si elle échoue**, la cause est une transcendante restante :
`grep -nE "Math\.(exp|log|cos|sin|atan2|hypot|cbrt|tan|asin|acos)" src/sim/*.ts` et traiter chaque
occurrence trouvée dans un chemin exécuté par tick. `Math.cbrt` de `topology.ts:153` est le suspect
le plus probable — le remplacer par une racine cubique entière par recherche :

```typescript
/** Plus petit l tel que l³ >= n, en arithmétique entière : pas de Math.cbrt. */
function coteDalle(n: number): number {
  let l = 1;
  while (l * l * l < n) l++;
  return Math.max(3, l);
}
```

- [ ] **Étape 7 : commit**

```bash
git add tools/porte-portabilite.mjs src/sim/portabilite.ts src/sim/portabilite.test.ts src/sim/topology.ts
git commit -m "test(sim): porte de portabilité — état identique au bit près sous V8 et JSC

Le projet écrivait « reproductible au bit près pour une graine donnée » comme l'un des
trois acquis du lot 1. Mesuré : c'est vrai DANS UNE SESSION, faux comme propriété du
modèle — l'organisme complet divergeait entre V8 et JSC dès le tick ~17 942.

Cette porte fait de la reproductibilité inter-moteurs une propriété VÉRIFIÉE. Le noyau
est bundlé une seule fois et le MÊME fichier tourne sous les deux moteurs : bundler
deux fois masquerait une différence de compilation."
```

---

## Tâche 6 : recalibration et mise à jour du journal

**Pourquoi :** les tâches 2, 3 et 4 changent toutes la dynamique. Toutes les constantes calibrées du
journal — `arena` 80, `metabMove` 0,10, `olfRange` 55, `TAUX_HOMEO` 0,0146, `accSeuil` 0,3 — ont été
réglées contre l'ancienne dynamique. Elles doivent **repasser la porte**, pas être supposées valides.

**Fichiers :**
- Modifier : `src/sim/params.ts` (valeurs recalibrées)
- Modifier : `docs/superpowers/notes/2026-07-30-vie-calibration.md` (nouvelle section)
- Vérifier : `src/sim/calibration.probe.test.ts` (bornes inchangées, valeurs remesurées)

- [ ] **Étape 1 : lancer la porte de calibration existante**

Lancer : `npx vitest run src/sim/calibration.probe.test.ts`
Attendu : **certains tests échouent**. C'est le résultat utile. Noter lesquels et de combien.

- [ ] **Étape 2 : remesurer le régime**

Rejouer les mesures de la tâche 3 du journal (profil du taux par courant de fond, sur 3 graines et
2 tailles) avec un banc jetable **hors dépôt**. Produire le tableau des taux mesurés.

- [ ] **Étape 3 : corriger les constantes de régime**

Ajuster `TAUX_CIBLE`, `TAUX_SPONTANE`, `TAUX_HOMEO` aux valeurs **mesurées**, **un paramètre à la
fois**, en notant l'effet de chacun. Ne jamais ajuster deux paramètres dans le même essai : le
journal du lot 1 a montré que c'est ainsi qu'on obtient un réseau saturé qu'on croit équilibré.

- [ ] **Étape 4 : vérifier que les bornes de la porte tiennent toujours**

Lancer : `npx vitest run src/sim/calibration.probe.test.ts`
Attendu : PASS, avec les **bornes inchangées** (extinction sous 0,4 × cible, emballement au-dessus de
2,5 ×, dérive tolérée à 0,25 ×). Si une borne doit bouger, c'est un signal — l'écrire dans le journal
et dire pourquoi, ne pas l'élargir en silence.

- [ ] **Étape 5 : mesurer le débit et vérifier la porte (b)**

Mesurer `stepLif` à n = 50 000. **Porte : au-dessus de 1 200 ticks/s** (contre 534 mesurés avant ce
lot ; la table de bruit donnait ×3,45 en mesure isolée, donc ≈ 1 840 attendus — la porte est fixée
plus bas pour laisser de la marge).

- [ ] **Étape 6 : écrire la section du journal**

Ajouter à `docs/superpowers/notes/2026-07-30-vie-calibration.md` une section « Lot 0 — recalibration
après changement d'horloge, de bruit et de géométrie », contenant : le tableau des taux remesurés, le
débit avant/après, l'empreinte de portabilité, et **la liste explicite des constantes dont la valeur a
changé**, avec l'ancienne et la nouvelle.

- [ ] **Étape 7 : lancer la suite complète et la porte de portabilité**

```bash
npm test && node tools/porte-portabilite.mjs
```
Attendu : tous les tests verts, porte passée.

- [ ] **Étape 8 : commit**

```bash
git add src/sim/params.ts docs/superpowers/notes/2026-07-30-vie-calibration.md src/sim/*.test.ts
git commit -m "docs(sim): recalibration du lot 0 — toutes les valeurs remesurées

Les tâches 2 à 4 changent la dynamique (géométrie sans transcendantes, bruit par table,
tauElig porté de 60 à 2500 ticks). Toutes les constantes calibrées du journal ont été
REMESURÉES, une à la fois, jamais ajustées jusqu'à ce que les tests passent.

Les bornes de la porte de calibration sont INCHANGÉES : c'est ce qui rend la
recalibration vérifiable plutôt que circulaire."
```

---

## Portes du lot 0

Le lot est terminé quand les quatre portes passent **simultanément** :

| Porte | Vérification | Seuil |
|---|---|---|
| (a) Régime | `npx vitest run src/sim/calibration.probe.test.ts` | PASS, bornes inchangées |
| (b) Débit | banc `stepLif`, n = 50 000 | **> 1 200 ticks/s** (534 avant) |
| (c) Témoin gelé | `npx vitest run src/sim/organism.test.ts -t "gelé-total"` | **0 poids déplacé** |
| (d) Portabilité | `node tools/porte-portabilite.mjs` | **empreintes identiques V8 / JSC** |

---

## Auto-revue du plan

**Couverture de la spécification (§9, lot 0) :** les quatre points du lot 0 sont couverts — `dt` en
paramètre et constantes en secondes (tâche 4), Ziggurat/table (tâche 3), portabilité (tâches 2 et 5),
homéostasie conditionnée (tâche 1). La recalibration (tâche 6) est ajoutée : la spécification
l'implique sans en faire une tâche.

**Écart assumé vis-à-vis de la spécification, et pourquoi :**

1. **Pas de bibliothèque mathématique portable.** La spécification proposait une libm en arithmétique
   pure. Le plan **élimine** les transcendantes à la place. C'est moins de code, exact au lieu
   d'approché, et plus rapide. La libm resterait nécessaire si un besoin futur exigeait une vraie
   trigonométrie — ce n'est pas le cas ici.
2. **Pas de Ziggurat, une table.** Même gain mesuré (×3,45), bien moins de code, et un vecteur d'or
   rend sa portabilité vérifiable. Le Ziggurat aurait besoin d'un `exp` pour sa queue, donc du
   problème qu'on cherche à éviter.
3. **L'homéostasie n'est pas conditionnée par `lr`** mais rendue pilotable, parce que conditionner
   ferait du témoin un modèle différent au lieu du même modèle sans apprentissage. Les deux témoins
   deviennent exprimables et le diagnostic du journal devient un test.

**Placeholders :** aucun. Chaque étape contient le code ou la commande exacte. Les deux seules valeurs
à remplir en cours d'exécution — `EMPREINTE_TABLE` (tâche 3, étape 5) et les constantes recalibrées
(tâche 6) — sont des **mesures**, et l'étape qui les produit est écrite.

**Cohérence des types :** `derivePoids` (tâche 1) prend `{ e, w }` et non `Topology` complet, pour
rester utilisable sur un instantané. `gaussTable` (tâche 3) a la même signature que l'ancien `gauss`
local, donc le branchement dans `lif.ts` et `topology.ts` est un remplacement de nom. `secteurDe`
(tâche 2) est exporté parce que son test d'équivalence en a besoin. `empreinteOrganisme` (tâche 5)
rend une chaîne et non un nombre, pour porter les compteurs d'événements en clair.

**Ordre des tâches :** 1 est indépendante et déverrouille les témoins. 2 et 3 changent toutes deux la
dynamique et pourraient être fusionnées, mais un relecteur peut légitimement accepter l'une et
refuser l'autre — elles restent séparées. 5 dépend de 2 et 3. 6 doit venir en dernier, après tout ce
qui touche à la dynamique.
