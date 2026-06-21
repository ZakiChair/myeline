# Incarnation v1 — créature à réservoir qui fourrage (design validé)

Date : 2026-06-21 · Suite de `2026-06-21-myeline-reservoir-creature-gate-design.md` (gate GO).
Décisions prises en brainstorming avec l'utilisateur.

## Acquis (le gate, GO ✅)

Reward-modulated readout sur réservoir figé à σ≈1 : apprend (sous-gate 1, 0.97), la mémoire du
réservoir est réelle (sous-gate 2), le crédit différé marche via trace d'éligibilité (sous-gate
3). Voir `src/lib/reservoir.ts`. L'incarnation construit DESSUS.

## Décisions

- **Tâche v1** : **fourrage minimal** — UNE source de nourriture ; apprendre à s'approcher et manger.
- **Corps** : **4 membres animés + tête + corps** (sujet-test) — pure **scène codée**, zéro impact
  sur l'apprentissage.
- **Honnêteté** : la vue *continue* rend la tâche **sans mémoire** (la direction est donnée → un
  readout sans réservoir l'apprendrait aussi). v1 prouve la **boucle incarnée end-to-end**, PAS
  que le réservoir est nécessaire (ça = sous-gate 2). Enhancement : **vue intermittente** (la
  source clignote → mémoire requise) reliera le comportement à « la criticité calcule ».

## Architecture

```
monde ──capteurs──▶ [ RÉSERVOIR continu, figé σ≈1 ] ──readout──softmax──▶ action ──▶ locomotion ──▶ monde
 (vue+toucher)        un step/tick, état qui PERSISTE       (politique apprise)   (primitive codée)
                                                                  │
                                            reward (manger / se rapprocher) ─modulé par récompense+éligibilité─┘
```

- **Capteurs → entrée réservoir** : *vue* = secteur de la source (≈6 canaux, 1-hot binaire) ;
  *toucher* = 1 canal au contact. Total ~7 canaux d'entrée.
- **Cerveau** : réservoir continu (un `stepScale`/tick, l'état persiste → mémoire), figé σ≈1,
  ~300 neurones ; readout sur ~150 neurones non-entrée.
- **Actions** : `{tourner-G, tourner-D, avancer}` ; softmax choisit, la locomotion (codée) exécute.
- **Apprentissage** : reward-modulated readout + trace d'éligibilité (λ>0) accumulée chaque tick ;
  récompense = se rapprocher (shaping dense, honnêtement étiqueté) + bonus à manger. (Stretch :
  reward épars « manger seulement ».)

## Boucle (un tick monde)

1. Capteurs depuis le monde → canaux actifs.
2. `applyInput` + `stepScale` (réservoir continu, pas de quiesce) → lire features.
3. `policy` softmax → échantillonner action.
4. `accumulateEligibility` (λ).
5. Locomotion : exécuter la primitive → bouger la créature (codé).
6. Récompense (rapprochement / manger) → `applyReward`. Manger → respawn pastille.

## Critère GO (gate de fourrage)
Taux de fourrage (pastilles/temps) de l'apprenant **≫** témoin (politique gelée / sans reward),
reproductible sur N graines. Sinon tuning (shaping/λ/η) ou NO-GO documenté.

## UI (après le gate de fourrage)

- **Hook partagé** `useReservoirCreature` : fait tourner réservoir + monde ; expose les deux états.
- **Onglet Créature** : arène + **corps à 4 membres animés** + trajectoire + flash récompense.
- **Onglet Échelle** : le réservoir **live** (`NeuralPointCloud`) réagissant aux capteurs ; pools
  entrée/lecture surlignés ; on VOIT l'activité onduler.
- **Plafond honnête affiché** : réservoir + politique = réel ; corps + locomotion = scène.

## Fichiers
- `src/lib/reservoir-creature.ts` *(nouveau, pur)* : monde + capteurs + boucle de fourrage + apprentissage.
- `src/lib/reservoir-creature.probe.test.ts` *(gate de fourrage)*.
- Puis : `useReservoirCreature.ts`, composant corps 4 membres, intégration Échelle live, mode UI.
