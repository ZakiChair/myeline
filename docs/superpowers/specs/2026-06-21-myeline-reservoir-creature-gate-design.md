# Créature à réservoir + readout par récompense — design du *gate*

Date : 2026-06-21 · Statut : design validé (brainstorming), gate à construire.

## Contexte & motivation

L'utilisateur veut une simulation « significative » : un sujet-test incarné (corps, membres,
capteurs vue/toucher) qui **apprend** à se déplacer, chercher de la nourriture, se mettre en
sécurité ; l'onglet **Créature** montre le corps en évolution, l'onglet **Échelle** montre
l'activité neuronale en direct.

### Le mur (mesuré toute la session)

Ce substrat (Greenberg–Hastings synchrone, **crédit à un seul tick**) ne peut PAS apprendre :
locomotion (séquence motrice multi-tick), mapping sensori-moteur profond (≥2 hops), ni
multi-objectif à cues chevauchants (interférence). Construire la vision *telle quelle* = une
scène codée à ~95 % vendue comme « le modèle a appris à vivre ». Refusé (ADN du projet).

### Le reframe choisi : Reservoir Computing + readout par récompense

Décision utilisateur : **maximiser l'activité neuronale réelle** (réservoir vivant) et
**apprendre à se comporter par récompense** (RL), pas seulement percevoir.

- **Avant** (créature v1) : petit cerveau 14 nœuds dont les *synapses* apprennent.
- **Maintenant** : grand réseau excitable **figé à la criticité** (σ≈1) — le moteur Échelle,
  montré live — qui transforme les capteurs en activité riche ; une **lecture (readout)
  apprise par récompense** lit cette activité pour produire le comportement.

**Pourquoi c'est possible ici alors que le mur tenait :** la mémoire temporelle vit DANS
l'état du réservoir (propriété d'écho). Un readout modulé par récompense + **trace
d'éligibilité** crédite action→récompense dans la *fenêtre mémoire du réservoir*, sans crédit
multi-tick dans le graphe. Approche documentée : reward-modulated Hebbian learning sur réseau
récurrent (Hoerzer, Legenstein & Maass, 2014).

### Plafond honnête (à réafficher dans l'UI)

- **Réel** : l'activité du réservoir (montrée en Échelle) + la **politique apprise** (readout).
- **Codé (scène)** : le corps, les membres, la **locomotion**, la géométrie des capteurs.
- **Risques résiduels** : apprentissage par récompense **bruité, convergence non garantie** ;
  crédit limité à la **fenêtre mémoire** (récompense trop tardive = échec) ; **actions
  discrètes** seulement ; σ « illustratif » tant qu'on n'a pas d'estimateur robuste.

## Stratégie : *gate d'abord*

Prouver headless que le mécanisme apprend AVANT d'investir dans l'UI. Méthode « socle
d'abord » du projet (chaque capacité a été gated avant l'UI).

## Le gate — architecture (pipeline RC)

```
capteurs ──applyInput──▶ [ RÉSERVOIR FIGÉ à σ≈1 ] ──readState──▶ readout linéaire ──softmax──▶ action
 (codage binaire)        ScaleGraph Échelle           (neurones NON-entrée)   1 vecteur/action  (primitive codée)
                         develop=false, hebbian=false                                │
                                                                                     ▼
                       apprentissage = reward-modulated Hebbian + éligibilité (single-layer, PAS le mur) :
                         e ← λ·e + état ⊗ (action − proba) ;   à la récompense :  W += η·(R − R̄)·e
```

- **Réservoir** : `ScaleGraph` Échelle **figé** (`develop=false`, `hebbian=false`), φ calibré
  près de σ≈1, `spontaneous=0` (déterminisme pour les témoins). ~300 neurones.
- **Entrée** : capteur injecté via `applyInput` dans un sous-ensemble *entrée* (qui passe
  réfractaire → **lecture sur des neurones NON-entrée**, contrainte de `io.ts`).
- **Readout** : 1 vecteur de poids par action sur un sous-échantillon (~100–200 neurones non
  entrée) ; sortie `W·état`, action par **softmax** (l'exploration = la perturbation).
- **Règle** : reward-modulated Hebbian + trace d'éligibilité `λ` ; baseline `R̄` (moyenne
  glissante) pour réduire la variance. **Seul** apprentissage, **single-layer**.

## Le gate — expérience

### Sous-gate 1 — le MÉCANISME apprend ?
La règle modulée par récompense apprend-elle une contingence sur le réservoir ?
Tâche minimale (peu importe qu'elle soit résoluble sans mémoire à ce stade) :
`appris ≫ yoked ≈ aléatoire` sur ~12–16 graines. De-risque la règle elle-même.

### Sous-gate 2 — le RÉSERVOIR sert à quelque chose ?
Tâche **dépendante de la mémoire** (cue intermittent/différé : la direction de la source
n'est révélée que par flashes, à agir sur le souvenir). Alors :
- **baseline SANS réservoir** (readout sur capteur brut instantané) **échoue** → isole l'apport du réservoir ;
- **courbe perf-vs-σ** : balayer φ, montrer que la perf **pique à σ≈1** (« la criticité calcule »).

### Témoins (non négociables)
- **yoked** : même calendrier de récompense, décorrélé des actions → ne doit pas apprendre.
- **aléatoire** : aucune récompense.
- **sans réservoir** : readout sur entrée brute (sous-gate 2).

### Critère GO
`appris ≫ yoked ≈ aléatoire` reproductible ; (sous-gate 2) `réservoir ≫ sans-réservoir` et
pic de perf près de σ≈1. Sinon **NO-GO documenté** (on l'aura appris pour pas cher).

### Choix ajustables
Taille réservoir (~300), 3 primitives d'action `{tourner-G, tourner-D, avancer}`, récompense
*shaping* d'abord (distance↓) puis *delayed* en test, `λ`/`η` à tuner.

## Si GO : la créature incarnée (esquisse conditionnelle)

- Onglet **Créature** : corps 4 membres + tête (**animation codée**), monde avec nourriture
  ET danger, capteurs vue/toucher → entrée du réservoir.
- Onglet **Échelle** : le réservoir **live** (`NeuralPointCloud`) réagissant aux capteurs.
- La **politique apprise** choisit les primitives motrices codées.
- Plafond honnête réaffiché (scène vs réel).

## Plan de fichiers (gate)

- `src/lib/reservoir.ts` *(nouveau, pur)* : `makeReservoir`, encodage capteur, `readoutAct`
  (softmax), `rewardModulatedUpdate` (éligibilité), boucle d'essai. Réutilise
  `scale-engine.ts` (`createScaleGraph`/`scaleGraphFromEdges`, `stepScale`) + `io.ts`.
- `src/lib/reservoir-gate.probe.test.ts` *(nouveau, jetable)* : sous-gate 1 (3 bras) ; puis
  sous-gate 2 (mémoire + sans-réservoir + balayage φ → perf-vs-σ).
- Aucune modification destructive du moteur (additif, comme toutes les sondes).

## Vérification

`npm test` (Vitest) reste vert ; le probe logue les Δ des 3 bras, la perf réservoir vs
sans-réservoir, et la courbe perf(φ)↔σ. Décision GO/NO-GO lue dans la sortie de test.
