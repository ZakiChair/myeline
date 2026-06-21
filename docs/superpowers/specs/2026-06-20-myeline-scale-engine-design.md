# Myéline — Passage à l'échelle (10K → 1M neurones)

Date : 2026-06-20
Statut : approuvé (Phase 1 à implémenter)

## Objectif

Simuler de gros réseaux de neurones (10K → 1M) sans casser l'expérience
« Studio » léchée actuelle (≲ 2–3K). Architecture : **un modèle de règles, deux
moteurs, deux rendus**, sélectionnés par la taille.

## Constat (mesuré)

Moteur actuel (`Map/Set` + poids à clé-string, cloné/tick), coût d'un tick
d'activité, hors rendu/layout :

| N | ms/tick | verdict |
|---|---|---|
| 1 000 | 1,3 | ✅ |
| 5 000 | 6,3 | ⚠️ |
| 10 000 | 13 | ❌ (budget frame mangé) |
| 50 000 | 99 | 💀 |

Trois murs : structures de données du moteur, layout force-directed (`d3-force`
plafonne à quelques milliers), rendu par-nœud (mesh/dessin). Les trois doivent
tomber.

## Décisions

1. **Deux moteurs en parallèle.** L'actuel `simulation.ts` (Map) reste pour le
   mode Studio, intact. Un nouveau moteur typed-array sert le mode Échelle.
   Règles dupliquées mais **constantes/paramètres partagés** (module `rules.ts`)
   et **mêmes assertions de test** sur les deux → pas de dérive.
2. **Embedding spatial 3D** comme layout du mode Échelle (pas de solveur force).
   Neurones placés dans un volume, connexions biaisées vers les voisins proches.
   L'activité se propage en **ondes spatiales cohérentes** = la thèse du milieu
   excitable rendue visible, et ça scale à 1M.

## Architecture

```
                         rules.ts (constantes + DEFAULT_PARAMS partagés)
                          /                                   \
   simulation.ts (Map, existant)                   scale-engine.ts (typed-array, nouveau)
        |                                                      |
   Studio: NeuralGraph(2D/3D)                       Échelle: NeuralPointCloud (THREE.Points)
   react-force-graph, glow par-nœud                 GPU points, embedding spatial, caméra orbitale
        \                                                      /
                         MyelineApp (bascule Studio ↔ Échelle)
```

## Phase 1 — livrable (cible 10K → ~100K fluide, thread principal)

### Unité A — `src/lib/rules.ts` (refactor chirurgical)
Extraire de `simulation.ts` les constantes de règles (VIT_GAIN, VIT_MAX,
VIT_BIRTH, VIT_SYNAPTO, W_INIT, W_UP, W_DOWN, W_MAX, W_PRUNE) et `DEFAULT_PARAMS`.
`simulation.ts` les importe (zéro changement de comportement). Pin par tests
existants (14/14 doivent rester verts).

### Unité B — `src/lib/scale-engine.ts` (typed-array, TDD)
- **SoA** : `state: Uint8Array`, `cooldown: Uint8Array`, `vitality: Int16Array`.
- **CSR** : `offsets: Int32Array` (N+1), `neighbors: Int32Array` (2·E). Reconstruit
  uniquement aux ticks de développement.
- **Poids** : `Float32Array` aligné sur les arêtes CSR.
- **Positions** : `Float32Array` (3·N) — embedding 3D.
- Double-buffer pour l'état (pas de clone/tick).
- `createScaleGraph(params, rng)` : positions dans un volume (boule/cube),
  arêtes via **grille spatiale** (bucket 3D → voisins proches, O(N)).
- `stepScale(graph, params, rng, develop)` :
  - Activité (chaque tick, lecture CSR) : Greenberg-Hastings (seuil φ relatif au
    degré, réfractaire R, étincelle p), vitalité.
  - Hebb (poids) : renforcement co-excités, décroissance sinon.
  - Développement (ticks lents) : mort (vitalité 0 + degré faible), naissance
    (hub actif, lien parent + voisins, position près du parent), synaptogenèse
    (voisin-de-voisin spatial), élagage (poids < seuil) → reconstruit le CSR.
- `computeScaleStats`, accès buffers pour le rendu.
- **Mêmes règles et constantes que `simulation.ts`** (via `rules.ts`).

### Unité C — `src/components/NeuralPointCloud.tsx` (rendu)
- `THREE.Points` + `BufferGeometry` : attribut `position` (du moteur),
  attribut `aState`/`aVitality` par point.
- `ShaderMaterial` custom : couleur par phase (thème), **blending additif**
  (glow néon sans bloom par-point), atténuation par distance.
- Caméra **orbitale** (réutiliser le pattern de NeuralGraph3D).
- Mise à jour de l'attribut d'état chaque frame depuis les typed-arrays.
- Couleurs issues du thème actif (`ThemeCanvas`).
- Picking : raycasting `Points` (seuil) pour clic = décharge (OK 10–100K).

### Unité D — hook + câblage UI
- `src/hooks/useScaleSimulation.ts` : boucle de tick sur le moteur typed-array,
  expose buffers + stats + contrôles (play/step/reset/regenerate/excite).
- `MyelineApp` : bascule **Studio ↔ Échelle**, slider de taille étendu (≤ 100K
  en Phase 1). Réutiliser ControlPanel/StatsPanel autant que possible.

## Phase 2 — plus tard (viser 1M)
- Moteur dans un **Web Worker + SharedArrayBuffer** ; le render-thread lit les
  buffers. Nécessite en-têtes **COOP `same-origin` / COEP `require-corp`** (config
  Next `headers()`) — peut compliquer les assets cross-origin.
- LOD au rendu, tuning de l'embedding, picking adapté à très grande échelle.

## Compromis assumés
- Look force-organique + drag par-nœud : réservés au mode Studio. À l'échelle,
  volume spatial navigable ; picking clic/hover OK 10–100K, limité vers 1M.
- Plasticité/développement actifs (peu coûteux en typed-array), togglables.
- Mémoire n'est pas le mur (~100–150 MB pour 1M nœuds + ~5,5M arêtes en
  typed-array) ; CPU/tick et layout le sont — l'embedding supprime le layout.

## Tests
- `rules.ts` : les 14 tests existants restent verts (refactor transparent).
- `scale-engine.test.ts` : mêmes scénarios sémantiques que `simulation.test.ts`
  (mort, seuil de décharge, réfractaire, Hebb, naissance parent+voisins,
  élagage, déterminisme) via un helper `makeScaleGraph`.
- Smoke perf : build + N ticks sous budget à 10K / 50K.

## Critères de succès Phase 1
- 10K → ~100K neurones, activité + développement, navigables et fluides
  (≥ 30 fps rendu) sur un Mac récent, thread principal.
- Les deux moteurs passent les mêmes assertions sémantiques.
- Mode Studio strictement inchangé.
```
