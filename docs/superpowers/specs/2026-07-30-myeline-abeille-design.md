# Myéline : l'abeille — refonder le modèle sur un animal réel

Date : 2026-07-30 · Branche : `vie` · Remplace l'anatomie de
`2026-07-30-myeline-vie-design.md`, conserve sa méthode

**Statut : conception soumise à revue. Rien n'est implémenté.**

Convention héritée du journal de calibration : chaque chiffre porte son statut — **mesuré** (dans
cette session ou le journal du lot 1), **publié** (avec sa source), **calculé** (arithmétique
déterministe), **à confirmer**, **contesté** (la littérature est en litige : interdit comme seuil
d'assertion), ou **inventé** (assumé comme tel). Aucun chiffre sans statut.

---

## 1. Le verdict

La demande : revoir le modèle de développement des systèmes neuronaux pour le faire correspondre à
quelque chose de réel, avec pour objectif de simuler une abeille de 700 000 à 1 million de neurones
et d'en retrouver les fonctions.

**Ce qu'il faut dire d'abord : la cible du million de neurones et l'échec du lot 1 ont la même
cause, et cette cause n'est pas l'échelle.**

Le lot 1 a échoué pour deux raisons structurelles. La plasticité était **diffuse** — 2,4 M d'arêtes
de signes mêlés sous un rééchelonnage homéostatique cohérent qui produisait 93 à 96 % du mouvement
synaptique (**mesuré**). Et l'horloge du modèle était **incohérente** : aucune valeur du tick ne rend
ses constantes simultanément plausibles (§4). Ni l'un ni l'autre ne se corrige en ajoutant des
neurones ; les deux se corrigent en adoptant l'organisation d'un animal réel.

Symétriquement : le cerveau d'abeille compte **950 000 à 960 000 neurones** dans ≈ 1 mm³
(Witthöft 1967, **publié** — les deux chiffres circulent selon ce que le comptage inclut). La
majorité sont dans les lobes optiques. Les cellules de Kenyon qui portent l'apprentissage associatif
y sont **éparses**, et l'apprentissage est confiné à une petite couche de sortie. **Le noyau
fonctionnel est donc petit et peu coûteux : atteindre 10⁶ neurones est un objectif de complétude et
de rendu, pas un objectif d'apprentissage.**

Cela ne retire rien à la cible de Zaki. Cela la sépare en deux chantiers et dit lequel porte les
fonctions. Le §8 chiffre l'autre.

### Les trois lectures de « modèle de développement »

La demande est ambiguë et le CLAUDE.md du dépôt interdit de trancher silencieusement.

1. **Les règles génératives qui construisent le réseau** — `buildTopology`. Remplacer la dalle
   corticale inventée par une construction ancrée sur des neuropiles nommés et comptés.
   **→ Lecture retenue.**
2. **La neurogenèse réelle** — ordre de naissance des cellules de Kenyon, couches concentriques du
   calice, rétinotopie des lobes optiques, maturation post-émergence. **→ Ouverture bornée** (§11,
   question 5), à n'implémenter que si les règles sont assez établies pour ne pas être une invention
   déguisée.
3. Le **modèle de développement logiciel** (les lots). **→ Écartée** : la phrase porte sur les
   systèmes neuronaux, pas sur la méthode de travail.

---

## 2. Ce que le modèle actuel est réellement

Le noyau `src/sim/` se présente comme un cerveau à huit régions. Il en a **une**.

Sur 50 000 neurones, **43 500 (87 %)** sont dans une dalle cubique torique à connectivité gaussienne
isotrope. Les 6 500 restants forment sept étiquettes **sans aucune connectivité interne** : un
« lobe olfactif » de 24 pools de 60 neurones dont les 60 neurones ne se parlent ni ne s'inhibent
n'est pas un neuropile, c'est un vecteur d'entrée de dimension 24 étalé sur 1 440 unités
(`topology.ts:43-51`, `257-268`).

Les six choix sans référent biologique :

| Choix | Emplacement | Pourquoi il ne correspond à rien |
|---|---|---|
| Dalle **torique** | `topology.ts:153`, `194-204` | Commodité de calcul (pas de bord à traiter). Aucun cerveau n'a de topologie périodique. |
| Connectivité gaussienne isotrope 3D | `topology.ts:269-278` | Approxime une tranche de cortex de mammifère. Un neuropile d'insecte est fait de faisceaux, de glomérules et de couches, pas d'un voisinage euclidien. |
| « CORTEX » majoritaire, **imposé par une garde** | `topology.ts:93-97` | L'insecte n'a pas de cortex. Le code refuse de construire si la dalle n'est pas majoritaire : il **impose** l'erreur. |
| `wInh = 15 × wExc` | `params.ts:96-97` | Mesuré **pour stabiliser la dalle**, pas pour correspondre à une inhibition réelle. Le journal l'admet : l'équilibre repose sur l'amplitude, pas sur le profil « mexican hat » annoncé. |
| Capteurs = 24 secteurs de relèvement | `world.ts:48-50` | C'est un capteur de robot. Une abeille n'a pas de résolution angulaire olfactive de 15°. |
| Région `VTA` | `topology.ts:50`, `236-238` | Structure de **vertébré** — et c'est une feuille **sans aucune arête sortante**, donc décorative. La dopamine effective est le scalaire `da` de `organism.ts:114`. |

Le dernier point est le symptôme de l'ensemble : **une région existe dans la topologie et ne fait
rien.** Des noms de structures posés à côté d'un calcul qui ne les utilise pas.

### Ce qui survit sans discussion

`lib/rng.ts`, l'ordre du tick de `stepLif` (« non négociable », à juste titre), le CSR bidirectionnel
(`topology.ts:286-309`), la décroissance paresseuse par `lastTouch` + LUT (`plasticity.ts:63-71`),
les trois coutures de protocole de `organism.ts:39-47` (`dopamineSource`, `onEvent`, `lesion`) — bien
placées, elles rendent les témoins exprimables sans chirurgie — et surtout la **discipline du journal
de calibration**. Cette discipline est le principal actif du projet, plus précieux que le code.

---

## 3. L'architecture proposée : la voie olfactive de l'abeille

Le principe : **on ne modélise pas un cerveau d'abeille, on modélise sa voie olfactive
d'apprentissage, et on nomme honnêtement ce qui manque.**

```
antennes ──▶ lobe antennaire ──▶ corps pédonculés ──────▶ neurones de sortie ──▶ muscle
             (glomérules,        (cellules de Kenyon,      (MBON)                (proboscis
              neurones de         code épars)                                     ou dard)
              projection)              ▲   │
                                       └───┘  APL : inhibition de rétroaction,
                                              impose la sparsité DANS le tick
                                       ▲
                VUMmx1 (octopamine, appétitif) ──┤   deux voies, pas un scalaire signé
                neurones dopaminergiques (aversif) ┘
```

| Population | Rôle | Effectif réel | Statut | Plastique |
|---|---|---|---|---|
| Récepteurs olfactifs | transduction | ≈ 60 000 par antenne | à confirmer | non |
| Glomérules du lobe antennaire | décorrélation, normalisation | ≈ 160 | **à confirmer** | non |
| Neurones de projection | glomérule → calice | ≈ 800–900 | à confirmer | non |
| **Cellules de Kenyon** | code épars | 100 000 à 200 000 **par hémisphère** | **à confirmer** — l'ambiguïté « par hémisphère ou au total » n'est pas résolue par les sources consultées | non |
| **APL** (rétroaction GABAergique) | normalisation, sparsité | 1 à quelques | publié qualitativement | non |
| **Neurones de sortie (MBON)** | lecture apprise | dizaines à centaines | à confirmer | **OUI — la seule couche plastique** |
| Corne latérale | voie innée, non apprise | — | à confirmer | non |
| **VUMmx1** | octopamine, appétitif | **1** | **publié** (Hammer 1993) | non |
| Neurones dopaminergiques | aversif | **plusieurs sous-populations** | **publié** | non |
| Lobes optiques | majorité du cerveau | ≈ 2/3 | à confirmer | absents au lot 1 |
| Complexe central | cap, intégration de trajet | ≈ 100 unités fonctionnelles | **publié** (§6, F10) | non — **câblé** |

**Aucun comptage « à confirmer » n'entre dans le code avant vérification sourcée.** Toute population
non confirmée est étiquetée **inventée** dans le code et dans l'interface. C'est le standard du
projet, appliqué à l'anatomie.

### Les trois différences structurelles qui règlent l'échec du lot 1

**a) La plasticité est confinée.** Une seule couche est plastique : cellules de Kenyon → neurones de
sortie. Ce n'est pas une simplification, c'est ce que la biologie décrit. Le signal d'apprentissage
cesse d'être dilué dans un réservoir récurrent. **Mesuré** en §5.1.

**b) La sparsité est imposée DANS le tick, pas sur les poids.** L'APL est une boucle d'inhibition de
rétroaction : elle réduit l'activité **au tick courant** sans jamais réécrire une synapse. Elle
remplace `homeostasis()` (`plasticity.ts:181-208`), cause mesurée de l'écrasement de l'apprentissage.
C'est le changement le plus important du document, et il est désormais **mesuré** (§5.5).

**c) Le renforcement n'est pas un scalaire signé.** Double dissociation publiée : octopamine =
appétitif (VUMmx1, Hammer 1993 ; bloquer le récepteur AmOA1 empêche l'acquisition **sans** altérer la
discrimination olfactive — Farooqui et al. 2003) ; dopamine = aversif (la spipérone et le flupentixol
bloquent le conditionnement du réflexe d'extension du dard, les antagonistes octopaminergiques sont
sans effet — Vergoz, Roussel, Sandoz & Giurfa 2007). **Tous publiés.**

Deux complications qui interdisent le scalaire :

- **Un même neuromodulateur porte deux fonctions de signes opposés.** La dopamine est instructive
  dans l'apprentissage associatif *et* répressive sur le gain de réactivité nociceptive
  (Tedjakumala et al. 2014, **publié** : le flupentixol *augmente* la sensibilité au choc). Cela
  implique **plusieurs sous-populations dopaminergiques**, pas un signal unique.
- **Le décours est bref et datable.** Pic de dopamine dans les corps pédonculés à **96 ± 12,8 ms**
  après le choc, retour à 25 % en **472 ± 136 ms** (Jarriault et al. 2018, **publié**). Très loin de
  la dopamine tonique permanente `−rBar` de `organism.ts:114`, que le journal du lot 1 avait déjà
  identifiée comme suspecte.

`addDopamine` (`plasticity.ts:134-170`) applique `gain = lr × d` à toutes les arêtes excitatrices :
un `da` négatif déprime exactement ce qu'un `da` positif potentialise. **On ne peut pas léser un
signe.** C'est ce que la fiche F9 (§6) rend falsifiable.

---

## 4. La base de temps : le premier acte, avant toute anatomie

C'est le résultat le plus important de cette revue, et il est indépendant de l'anatomie.

Le projet a choisi de n'affirmer aucune correspondance tick → seconde (`params.ts:3-5`). Choix
raisonnable, mais jamais vérifié : **il n'existe aucune valeur du tick rendant les constantes
actuelles simultanément plausibles.**

| constante | valeur | si 1 tick = 1 ms | si 1 tick = 10 ms | si 1 tick = 100 ms |
|---|---|---|---|---|
| `tauM` (membrane) | 20 | 20 ms ✔ | 200 ms ✘ (10× trop lent) | 2 s ✘ |
| `tauS` | 5 | 5 ms ✔ | 50 ms ~ | 500 ms ✘ |
| délais axonaux | 1–8 | 1–8 ms ✔ | 10–80 ms ✘ | 0,1–0,8 s ✘ |
| `tauElig` requis pour franchir un ISI de 3 s | 60 | 2 492 (**×41,5**) | 250 (**×4,2**) | 25 (×0,4) |

Le rapport qui gouverne l'attribution temporelle du crédit est `tauElig / tauM` :

- **noyau actuel : 3** (60/20, lecture directe de `params.ts`)
- **biologie : 50 à 1 000** (membrane 10–20 ms, éligibilité 1–10 s)
- **abeille, chiffres spécifiques : ≈ 150** — intervalle CS-US antérograde optimal ≈ **3 s** (Giurfa
  et al. 2009, **publié**), membrane ≈ 20 ms

**Le noyau est environ 50 fois trop court.** Cela réhabilite l'hypothèse 2 du journal de calibration
(« la fenêtre de crédit est trop courte », classée *partiellement écartée*) : elle n'était pas
partiellement vraie, elle était vraie d'un facteur ≈ 50, et le journal ne pouvait pas le voir faute
d'unité de référence. Deux calculs indépendants y aboutissent — le mien, par le rapport des
constantes ; celui de l'analyse du banc, par la fraction d'éligibilité survivante à l'ISI publié.

### Décision : `dt = 1 ms`, et pourquoi je m'écarte de l'alternative à 10 ms

L'analyse du banc de tâches recommande `1 tick = 10 ms`, ce qui divise le coût des protocoles par
dix — mais au prix de lire `tauM = 20 ticks` comme 200 ms, soit dix fois trop lent pour une membrane,
et les délais axonaux comme 10 à 80 ms au lieu de 1 à 5 ms. **Ce compromis contredit l'objet même de
la refonte** : on ne peut pas invoquer la correspondance au réel et rendre le neurone
non physiologique pour gagner du temps machine.

`dt = 1 ms` retenu, avec son coût affiché (**calculé**, aux débits mesurés) :

| | à 10 ms/tick | **à 1 ms/tick** |
|---|---|---|
| essai PER complet | 1 800 ticks | 18 000 ticks |
| protocole d'acquisition (7 essais × 40 sujets × 2 groupes) | 1,01 M ticks | **10,1 M ticks** |
| temps mur à n = 2 500 | 2,2 min | **22 min** |
| `tauElig` requis | 250 | ≈ 2 500 |

**22 minutes par protocole est acceptable** — c'est le même ordre que les 53 s × 3 graines + réglages
du lot 1, pour un résultat falsifiable au lieu d'un signal faible. Le coût de la LUT de décroissance
passe de 241 à ≈ 10 001 entrées (`plasticity.ts:49`) : en O(τ), pas en O(arêtes), donc négligeable.
En revanche `dumpEvery = 16` devient absurdement fréquent face à une fenêtre de 2 500 ticks et doit
être re-dérivé.

### Deux corrections structurelles qui en découlent

- **L'homéostasie doit être cadencée sur l'inter-essai, jamais sur `lif.t % homeoEvery`.** Avec
  `homeoEvery = 500`, elle se déclencherait 3 à 4 fois par essai — dont au moins une fois **entre le
  CS et l'US**, brouillant l'appariement à l'instant exact où il se forme. Dans un banc à essais,
  elle devient une opération d'inter-essai, ce qui est aussi sa lecture biologique. (Et §5.5 suggère
  qu'elle peut disparaître.)
- **Le témoin gelé n'est pas gelé.** `organism.ts:121-123` appelle `homeostasis` sans condition sur
  `lr`. À corriger avant toute porte : sans cela, aucune comparaison plastique/gelé n'est
  interprétable — le journal l'a payé.

---

## 5. Ce qui a déjà été mesuré pour valider cette conception

Cinq sondes jetables exécutées **avant** d'écrire ce document, précisément parce que l'affirmer sans
mesure aurait répété l'erreur du lot 1. Scripts hors dépôt, déterministes.

### 5.1 Le confinement rend l'apprentissage audible (**mesuré**)

160 glomérules → 2 000 cellules de Kenyon (10 afférences chacune) → 1 neurone de sortie ; sparsité de
5 % imposée par seuil global ; plasticité **uniquement** sur les 2 000 synapses de sortie.
Conditionnement différentiel A+/B−, 12 essais, 5 graines.

| essai | plastique | gelé (`lr` = 0) | yoked |
|---|---|---|---|
| 0 | −0,018 ± 0,094 | −0,018 ± 0,094 | −0,018 ± 0,094 |
| 3 | **+0,218 ± 0,100** | −0,018 ± 0,094 | −0,249 ± 0,133 |
| 12 | **+0,929 ± 0,137** | −0,018 ± 0,094 | −0,940 ± 0,255 |

Synapses déplacées : **99 / 2 000 (5,0 %)** en plastique, **0 / 2 000 en gelé**.

Trois écarts avec le lot 1, tous structurels :

1. **Rapport signal / dispersion = 6,8** à l'essai 12. Au lot 1, l'effet cherché (×1,17) était du
   même ordre que la dispersion : rien n'était concluant.
2. **Le témoin gelé est réellement gelé** — 0 synapse déplacée. Au lot 1 il bougeait 93 à 96 % autant
   que le plastique : la comparaison était vide de sens.
3. **Le témoin yoked part dans le sens inverse** (−0,940). Il sépare enfin « apprendre » de
   « recevoir du signal ».

### 5.2 Le mécanisme reproduit l'asymétrie temporelle publiée, sans ajustement (**mesuré**)

Avec du temps : décharges de Kenyon étalées sur 40 ticks, éligibilité à `τ = 60` ticks (**la valeur
actuelle du noyau**), octopamine à décalage variable, 8 essais, 5 graines.

| décalage odeur → octopamine | discrimination | synapses créditées |
|---|---|---|
| arrière −120 / −60 / −20 | −0,018 (= base) | **0** |
| simultané 0 | +0,004 | 4 |
| **avant +40** (fin de l'odeur) | **+0,567 ± 0,126** | 60 |
| avant +120 | +0,136 | 60 |
| avant +300 | −0,011 | 60 |

**L'appariement arrière n'apprend rigoureusement rien** — zéro synapse créditée, parce que
l'éligibilité n'existe pas encore quand l'octopamine arrive. C'est la causalité inscrite dans le
mécanisme, pas un réglage. La forme (avant efficace, arrière inefficace, optimum intermédiaire) est
celle qui est publiée chez l'abeille (Hammer 1993 pour la directionnalité par substitution de
VUMmx1 ; Giurfa et al. 2009 pour l'optimum), et **aucun paramètre n'a été ajusté pour l'obtenir**.

Retombée : cette courbe est le premier moyen honnête d'ancrer le tick au temps biologique — une
**ancre mesurée**, pas une convention posée.

### 5.3 Le modèle atteint la courbe d'acquisition publiée (**mesuré**)

Référence : Bitterman, Menzel, Fietz & Schäfer 1983, via Giurfa & Sandoz 2012 Fig. 4 (**publié**) —
apparié ≈ **80 % de réponse à l'essai 3**, non apparié **plat proche de 0 %** sur 8 essais.

120 « abeilles », chacune avec son câblage et ses odeurs ; règle de décision par seuil sur la réponse
du neurone de sortie.

| `lr` | essai 1 | essai 2 | **essai 3** | essai 8 |
|---|---|---|---|---|
| 0,05 | 11 % | 22 % | 42 % | 78 % |
| **0,15** | 11 % | 62 % | **≈ 80 %** | 100 % |
| 0,40 | 11 % | 86 % | 100 % | 100 % |

Le témoin non apparié suit **exactement** le taux spontané visé, **indépendamment de `lr`** — preuve
directe qu'il ne contient aucun apprentissage :

| taux spontané visé | apparié essai 3 | témoin non apparié (max) |
|---|---|---|
| 10 % | 73 % | 17 % |
| **3 %** | **67 %** | **7 %** |
| 3 % (bruit réduit) | 91 % | 4 % |

**Règle méthodologique à inscrire dans le projet : le nombre de paramètres ajustés doit être déclaré
et rester inférieur au nombre de propriétés prédites.** Ici : **deux ajustés** (`lr`, amplitude du
bruit de décision — le seuil se déduit d'un taux spontané publié, c'est une donnée) contre **cinq
prédites** — asymétrie avant/arrière, optimum d'intervalle, gradient de généralisation, témoin gelé
plat, témoin yoked inversé.

### 5.4 Le bruit gaussien est le premier poste de coût, et il ignore les arêtes (**mesuré**)

`lif.ts:42-45` tire un gaussien par Box–Muller (`Math.log` + `Math.cos` + `Math.sqrt` + 2 appels RNG)
pour **tous** les n neurones à chaque tick. Coût isolé : **22,44 ns par tirage**.

Sur le vrai noyau, boucle LIF, régime inchangé (0,0213 contre 0,0214 décharge/neurone/tick) :

| n | arêtes | Box–Muller | table précalculée | part du bruit |
|---|---|---|---|---|
| 12 000 | 717 440 | 2 889 ticks/s | 5 983 ticks/s | **51,7 %** |
| 50 000 | 2 987 520 | 534 ticks/s | 1 361 ticks/s | **60,7 %** |

Le journal (tâche 8) attribuait 17 % au balayage dopaminergique et raisonnait comme si les arêtes
gouvernaient la montée en échelle. **Plus de la moitié du temps part dans un poste proportionnel à
n**, que réduire le fan-out ne fera pas baisser. À n = 10⁶ le bruit seul plafonne à **44,6 ticks/s,
même avec zéro synapse.**

Réserve : la table de 65 536 tirages mesure le coût, elle ne le résout pas (elle se répète et
introduit des corrélations). Le remplacement à retenir est l'algorithme **Ziggurat** (aucune
transcendante dans ~98 % des tirages), à valider par un test de régime contre le Box–Muller. Effet
de bord favorable : il retire les transcendantes du chemin par tick, ce qui **améliore** la
reproductibilité inter-machines (§8).

### 5.5 L'inhibition de rétroaction remplace l'homéostasie — **mesuré sur substrat impulsionnel**

C'était le risque n° 1 de la première version de ce document. 20 000 cellules de Kenyon
impulsionnelles avec **les équations exactes de `lif.ts:105-116`** et ses constantes, un APL unique
avec délai de 2 ticks, entrée par bouffées d'odeur renouvelées tous les 400 ticks, **100 000 ticks**,
et **aucune mise à l'échelle de poids, jamais**.

| gain APL | taux par fenêtre de 2 000 ticks (début → fin) | min | max | verdict |
|---|---|---|---|---|
| 0 (pas d'APL) | 0,0945 → 0,0920 → 0,0922 → 0,0937 → 0,0920 | 0,0894 | 0,0954 | borné, mais à 9,4 % |
| 0,5 | 0,0849 → … → 0,0830 | 0,0809 | 0,0859 | borné |
| 2 | 0,0692 → … → 0,0685 | 0,0673 | 0,0704 | borné |
| **8** | **0,0384 → 0,0394 → 0,0401 → 0,0401 → 0,0395** | **0,0384** | **0,0415** | **borné, ≈ 4 %** |
| 30 | 0,0223 → … → 0,0217 | 0,0209 | 0,0232 | borné |

Trois conclusions :

1. **Le taux reste borné sur 100 000 ticks sans aucun rééchelonnage de poids.** La dérive
   début → fin est négligeable (0,0384 → 0,0395 au gain 8), et l'étendue max−min vaut ≈ 8 % de la
   valeur centrale — largement dans la tolérance de dérive de la porte de calibration existante
   (25 %).
2. **Le gain de l'APL règle la sparsité de façon monotone** : 9,4 % → 8,5 % → 6,9 % → 4,0 % → 2,2 %.
   La sparsité devient donc un **paramètre du circuit**, comme dans la biologie, et non le produit
   d'une réécriture de synapses.
3. **Le seuil adaptatif seul (gain 0) borne aussi le taux, mais à 9,4 %** — presque le double de la
   cible. Le rôle propre de l'APL n'est donc pas la stabilité, c'est de **fixer le niveau de
   sparsité**, ce qui est exactement ce qui gouverne la capacité mémoire du code des cellules de
   Kenyon.

**Volet B — la plasticité de la couche de sortie ne peut PAS déstabiliser les cellules de Kenyon.**
Même dispositif, la couche de sortie apprenant **sans aucun arrêt** (dérive finale |Δw| = 2,386 par
synapse, c'est-à-dire des poids poussés de 0,5 jusqu'au plafond) :

| couche de sortie | taux par fenêtre de 2 000 ticks | min | max |
|---|---|---|---|
| figée | 0,0401 0,0408 0,0407 0,0388 0,0384 0,0400 … 0,0397 | 0,0384 | 0,0411 |
| **plastique** | **0,0401 0,0408 0,0407 0,0388 0,0384 0,0400 … 0,0397** | **0,0384** | **0,0411** |

**Les deux suites sont identiques au chiffre près.** Ce n'est pas une mesure de robustesse, c'est une
propriété structurelle rendue visible : la couche plastique est **en aval**, il n'existe aucun chemin
de retour du neurone de sortie vers les cellules de Kenyon. Le confinement de la plasticité **donne
la stabilité par construction** — c'est exactement ce que le réservoir récurrent du lot 1 ne pouvait
pas offrir, et c'est pourquoi il avait besoin d'une homéostasie qui écrasait son propre apprentissage.

**Volet C — pas d'oscillation dans la plage utile.** Une boucle de rétroaction à délai peut alterner ;
autocorrélation à décalage 1 du taux (proche de −1 = alternance) :

| gain APL | taux moyen | écart-type inter-fenêtres | autocorr(1) |
|---|---|---|---|
| 2 | 0,0693 | 0,00207 | +0,554 |
| **8** (plage utile) | **0,0398** | **0,00363** | **−0,028** |
| 30 | 0,0224 | 0,00246 | −0,145 |
| 100 | 0,0153 | 0,00190 | **−0,300 ← alternance** |
| 300 | 0,0108 | 0,00171 | −0,216 |

L'alternance n'apparaît qu'autour du gain 100, soit **≈ 12 fois au-dessus du réglage utile**. Le gain
doit donc être borné et cette borne documentée, mais le risque ne concerne pas le régime de travail.

**Conclusion : `homeostasis()` peut être retirée du chemin causal.** Les trois volets sont mesurés.

---

## 6. Le banc de tâches : ce qui remplace l'arène

« Retrouver les fonctions » n'a de sens que si chaque fonction dispose d'un harnais qui la mesure.
L'arène actuelle (`world.ts`) ne permet de mesurer **aucun** protocole réel d'abeille. Elle devient
**un harnais parmi plusieurs**, pas le monde — donc rien n'est perdu.

### 6.1 Le gain n'est pas seulement anatomique, il est statistique

Le défaut principal de l'arène n'est pas de ne rien mesurer de réel : c'est que son unité
d'observation est la **durée de vie médiane d'un organisme**, sur 3 graines, avec une dispersion
inter-tranches du même ordre que l'effet cherché (**mesuré**). Aucun réglage ne rendra ce protocole
concluant.

Le conditionnement du réflexe d'extension du proboscis (PER) renverse cela : l'unité devient **une
réponse binaire par essai et par sujet**, avec 40 sujets par groupe — taille d'échantillon
explicitement requise par le protocole standard (**publié** : Matsumoto, Menzel, Sandoz & Giurfa
2012, *J Neurosci Methods* 211:159-167). Puissance obtenue par test exact de Fisher à 40
sujets/groupe, α = 0,05 bilatéral, 20 000 tirages (**calculé**) :

| effet vrai (apparié vs témoin) | puissance |
|---|---|
| 80 % vs 10 % (l'effet publié) | 100,0 % |
| 60 % vs 10 % | 99,9 % |
| **45 % vs 10 %** | **93,5 %** |
| 35 % vs 10 % | 71,5 % |
| 25 % vs 10 % | 33,1 % |

**Le banc détecterait un apprentissage quatre fois plus faible que celui de l'abeille réelle, avec
plus de 90 % de puissance.** C'est le renversement complet de la situation du lot 1, où un effet réel
de ×1,17 était indistinguable du bruit.

### 6.2 Le harnais harnaché : aucune locomotion

Découverte décisive : **le PER se pratique sur une abeille immobilisée.** Disparaissent d'un coup la
position et le cap, l'arène et ses murs, les 24 secteurs de relèvement, le prédateur, l'énergie, le
métabolisme, la mort, la persistance d'action — et surtout **la chaîne causale multi-décisions de
l'approche**, ces « 60 à 100 ticks et plus » dont le lot 1 a montré que seul le dernier était
crédité. Le CS et l'US sont posés à des instants connus au tick près : **le problème d'attribution du
crédit passe d'ouvert à trivial.** C'est la raison pour laquelle ce harnais vient en premier.

Protocole standard (**publié**, Matsumoto et al. 2012) : CS odeur **4 s**, US sucrose **3 s**,
**ISI 3 s** (1 s de chevauchement), 5 essais, ITI moyen 10 min.

Structure d'essai proposée, à `dt = 1 ms` — **chaque durée est celle du protocole, seul l'ITI est
comprimé** :

| phase | ticks | biologie |
|---|---|---|
| mise en place | 2 000 | 2 s (comprimé de 25 s) |
| CS (odeur) | 4 000 | **4 s — conforme** |
| US, début à CS + 3 000 | — | **ISI 3 s — conforme** |
| US (sucrose) | 3 000 | **3 s — conforme**, chevauchement 1 s |
| après | 2 000 | 2 s (comprimé de 25 s) |
| **ITI** | **8 000** | **8 s — comprimé de 600 s, facteur 75** |
| **total** | **18 000** | 18 s |

**La compression de l'ITI est la principale concession de fidélité du banc, et elle a une
conséquence à déclarer** : elle place le banc en régime **massé**, alors que l'espacé (ITI 10 min)
produit une mémoire à long terme dépendante de la synthèse protéique que le massé ne produit pas
(**publié** : Giurfa et al. 2009 ; Matsumoto et al. 2012). Le banc mesure donc l'acquisition et la
rétention courte, et **ne peut pas** prétendre reproduire la dissociation massé/espacé ni la
rétention à 24–72 h. À déclarer, pas à approximer.

### 6.3 Les fiches retenues, par ordre de bataille

Classement par (valeur de démonstration) / (coût). Trois critères de valeur : la porte est-elle
falsifiable ; le témoin est-il publié ; un échec serait-il informatif. Coûts **calculés** à
`dt = 1 ms` et 7 493 ticks/s à n = 2 500 (**mesuré**).

**Rang 0 — les préalables, sans harnais.** Conditionner l'homéostasie par `lr`
(`organism.ts:121-123`) et **mesurer** ensuite la part de l'apprentissage dans le mouvement
synaptique. Porter `tauElig` à ≈ 2 500 et **mesurer** que l'éligibilité franchit l'ISI. Coût nul.
**Aucune fiche avant cela** : le lot 1 a démontré ce qui arrive quand on mesure un apprentissage sous
une homéostasie qui produit 95 % du mouvement.

**Rang 1 — PER appétitif.** ≈ 22 min à n = 2 500. Porte : à l'essai 5, la proportion de répondants
est strictement supérieure dans le groupe apparié que dans le groupe **non apparié explicite** (5
odeurs seules + 5 sucroses seuls en séquence pseudo-aléatoire — le témoin publié), Fisher exact
p < 0,01, 40 sujets/groupe. Deux témoins supplémentaires gratuits : **appariement inversé** (US avant
CS) et **gelé** (après le préalable). Un contrôle de bon fonctionnement est intégré : un câblage
direct gustatif → proboscis donne le réflexe inconditionnel, et **tout sujet qui ne le montre pas est
exclu** — exactement comme l'exige le protocole.

*Avantage indisponible au biologiste* : le noyau est reproductible au bit près, donc **le même
cerveau** (même graine, mêmes poids initiaux) peut passer dans la condition appariée et dans la
condition non appariée. Plan **intra-sujet**, impossible sur une vraie abeille qu'on ne peut pas
déconditionner. Le lot 1 avait l'ingrédient sans l'exploiter.

**Rang 2 — Généralisation olfactive.** Vient avant la discrimination, contre l'intuition, parce que
c'est **la seule fiche qui calibre l'encodeur sensoriel sur des nombres publiés**. Réponse croisée
après conditionnement à un nonanol (**publié** : Guerrieri, Schubert, Sandoz & Giurfa 2005,
*PLoS Biology* 3:e60 — 16 odorants, 2 048 abeilles) :

| écart de chaîne carbonée | réponse croisée |
|---|---|
| 1 carbone | **53 %** |
| 2 carbones | **31 %** |
| 3 carbones | **23 %** |

Sans cette calibration, `wSensory`, `injectGain` et la géométrie des odeurs restent choisis sur des
critères de régime interne, et **toutes les fiches à deux odeurs mesurent une similarité que nous
avons choisie nous-mêmes**. Porte : décroissance strictement monotone (test de tendance, p < 0,01) et
rapport 1-carbone / 3-carbones dans [1,7 ; 2,9] (encadrement du 53/23 = 2,3 publié à ± 25 %).

*Ma sonde 5.1 échoue déjà ce test, et c'est utile de le savoir* : deux odeurs **indépendantes** y
donnaient 53 % de réponse relative, soit ce que la biologie donne pour deux odeurs distantes d'**un
seul carbone**. Mon espace d'odeurs est donc beaucoup trop confusable. C'est exactement ce que cette
fiche corrige.

**Rang 3 — Réflexe d'extension du dard (SER), aversif.** ≈ 25 min. Protocole (**publié**, Vergoz
et al. 2007) : CS odeur **5 s**, US choc **7,5 V / 60 Hz / 2 s**, ISI 3 s, 6 essais, notation
**pendant les 2 s du choc** — donc la fenêtre de notation est un paramètre du protocole, pas une
constante du cerveau. Apparié F(5,190) = 8,46 p < 0,0001 ; non apparié F(5,185) = 2,19 non
significatif.

**Porte à trois volets simultanés sur le même cerveau, la plus exigeante du banc :**
1. le SER apparié monte, le non apparié non ;
2. le PER appétitif fonctionne **toujours** sur ce même cerveau ;
3. **une lésion de la voie dopaminergique abolit le SER sans abolir le PER, et une lésion de la voie
   octopaminergique fait l'inverse.**

Le volet 3 est ce qui rend cette fiche irremplaçable : il **falsifie directement** le choix d'une
dopamine scalaire unique (`plasticity.ts:134`) — on ne peut pas léser un signe. C'est un test
d'architecture, pas de réglage, et il réutilise le mécanisme de lésion déjà écrit (`lif.ts:36-37`,
`organism.ts:69-74`).

**Rang 4 — Discrimination différentielle A+/B−.** Prérequis de tout le reste. **Publié** (Mota &
Giurfa 2010, n = 111) : 5 essais CS+ et 5 CS−, interaction stimulus × essai F(4,436) = 76,21
p < 0,0001 — mais **31,5 % des abeilles (35/111) échouent la discrimination initiale**. La porte doit
donc tolérer au plus ≈ 35 % de non-apprenants : interdiction d'une porte « tous les sujets
apprennent ». Témoin indispensable : **contingences inversées entre sujets** (moitié A+/B−, moitié
B+/A−), sinon on mesure une préférence du câblage.

**Rang 5 — Odométrie par flux optique.** Peu chère, et **le témoin le plus élégant du banc**.
⚠️ **La littérature quantitative est CONTESTÉE** : la calibration de 17,7°/ms (Srinivasan et al.
2000) fait l'objet d'une critique publiée obtenant 13,86°/ms (Luebbert & Pachter 2024,
arXiv:2405.12998), et le *Journal of Experimental Biology* a émis une **Expression of Concern** en
2024 sur l'article de 1996 pour une incohérence de longueur de tunnel. **Aucun seuil d'assertion ne
doit s'y adosser.**

Deux résultats qualitatifs restent solides et suffisent (**publié**, Srinivasan et al. 1996) :
rayures **axiales** (flux optique supprimé) → aucune capacité à évaluer la distance ; période des
rayures doublée ou divisée par deux → **pas d'erreur** (les abeilles intègrent un flux, elles ne
comptent pas les rayures). Porte purement **ordinale** : position d'arrêt corrélée à la distance en
texture perpendiculaire, décorrélée en texture axiale, inchangée quand la période double. Trois
assertions, zéro chiffre contesté. La texture axiale **est** le témoin, et il est publié.

**Rang 6 — Intégration de trajet, en version CÂBLÉE.** Le circuit est entièrement spécifié
(**publié** : Stone, Webb, Adden, Heinze et al. 2017, *Current Biology* 27:3069-3085) : ≈ 100 unités
en 6 couches — 8 neurones de compas en attracteur d'anneau (résolution 45°), 16 + 16 d'entrée
polarisée, 4 de vitesse, une couche de mémoire du vecteur, 16 pontins, 16 de pilotage. Performance
publiée : retour à **16 cm du départ (σ = 11,1 cm, n = 10)** sur robot après un trajet aléatoire de
6 à 12 m ; en simulation, trajets jusqu'à 5 000 pas, saturation au-delà de 20 000 ; robuste à
10–20 % de bruit.

**Reclassement important, et c'est une honnêteté à ne pas perdre : ce circuit est câblé, pas
appris.** Le livrer démontre que le substrat LIF/CSR peut porter un attracteur d'anneau et un
intégrateur — un résultat sur le **substrat**, visuellement spectaculaire (un attracteur d'anneau se
*voit*), mais qui **ne dit rien** sur la règle à trois facteurs, c'est-à-dire rien sur la question qui
a fait échouer le lot 1. Demander à la dalle générique de l'apprendre échouerait, et l'échec serait
peu informatif : Stone et al. montrent que la fonction repose sur une connectivité en anneau très
spécifique que la connectivité gaussienne torique ne produit pas. **À livrer en le nommant pour ce
qu'il est.**

### 6.4 Écarté, et documenté pour qu'on ne le repropose pas

| Fonction | Cause du rejet |
|---|---|
| **Blocage** (effet Kamin) | **La référence publiée n'existe pas sous forme exploitable.** Blocage olfactif trouvé dans **4 combinaisons sur 24**, ≈ 1 000 abeilles en design équilibré (**publié** : Guerrieri, Lachnit, Gerber & Giurfa 2005, *Learn Mem* 12:86-95), après un rapport positif (Smith & Cobey 1994) et un échec de réplication (Gerber & Ullrich 1999). En vol libre, Blaser et al. 2006 identifient un artefact de « pseudoblocage ». **Une porte que l'animal échoue dans 83 % des configurations n'est pas une porte.** |
| **Inversions multiples** | La signature publiée est une **dégradation** : une inversion réussie par 34 sujets sur 76 apprenants, puis décroissance des scores (F(3,330) = 11,34 p < 0,0001), **pas de « learning-to-learn »** (**publié** : Mota & Giurfa 2010). Un modèle qui s'améliorerait serait aussi faux qu'un modèle qui n'inverse pas. Coût double, valeur faible. |
| **Rétention 24–72 h, massé vs espacé** | Dépend de la consolidation par synthèse protéique (**publié** : Tedjakumala & Giurfa 2013), non modélisée. Et 24 h = 86,4 M ticks **par sujet** à `dt = 1 ms` (**calculé**). Aggravé par la compression de l'ITI (§6.2), qui place le banc en régime massé. |
| **Compas céleste et compensation temporelle** | **Hors de portée par coût, quantifié** : 1,04 G ticks ≈ 1,6 jour à n = 2 500 et **39,5 jours à n = 50 000** (**calculé**), plus une horloge circadienne et une éphéméride absentes du noyau. *Note de rigueur : les 15°/h souvent cités ne sont pas une précision biologique mais la rotation de la Terre ; l'apport de Dyer & Dickinson 1994 est que les abeilles suivent la courbe non linéaire réelle.* |
| **Apprentissage visuel harnaché** | Référence faible chez l'animal réel : au mieux **70 %** avec un CS de 13 s, et **aucune discrimination à 5 s** (**publié** : JEB 2018, 221:jeb179622) — contre 80 % en 3 essais pour l'olfactif. Le plus cher par unité de valeur. À écarter du premier lot. |
| **Butenage et constance florale** | **Aucune porte formulable** : la constance se mesure par un indice dépendant de la disponibilité relative des fleurs. Fixer cette économie ferait d'elle le véritable objet de la mesure. |
| **Danse en huit, colonie, social** | Exige deux organismes et un canal de transmission. Hors périmètre de fond, pas de coût. |
| **Corps complet, vision active** | Le harnachement supprime par construction le mouvement qui sert à voir — c'est précisément ce qui rend le labyrinthe en Y supérieur au harnachement visuel chez l'animal réel. |

### 6.5 Une limite d'honnêteté à consigner

**Le banc mesure si le réseau reproduit une courbe publiée. Il ne mesure pas s'il la reproduit pour
les bonnes raisons.** Un encodeur d'odeurs suffisamment ajusté peut produire le gradient 53/31/23
sans qu'aucun apprentissage n'ait lieu. C'est pourquoi chaque fiche porte son témoin, et pourquoi
**le témoin non apparié compte plus que la porte elle-même** : il est la seule chose qui distingue
« le modèle a la bonne courbe » de « le modèle apprend ». C'est la leçon que le lot 1 a payée cher,
formulée à l'avance.

---

## 7. Le couplage à casser

Le noyau est propre, mais **écrit pour un seul monde**, et la dépendance va dans le mauvais sens en
un point.

**Le point dur — le cerveau importe la géométrie de l'arène :**

- **`brain.ts:15`** — `import { SECTEURS_ALARM, SECTEURS_OLF, SECTEURS_SOMA } from "./world"`. Les
  commentaires de `brain.ts:1-3` affirment « ne connaît pas le monde » : l'intention est bonne,
  l'import la contredit. Ces constantes sont des **nombres de secteurs de relèvement**, notion
  inexistante pour une abeille immobilisée.
- **`brain.ts:29-34`** — la table `CANAUX` code en dur les quatre modalités de l'arène.
- **`brain.ts:43-48`** — `createBrain` **jette** si une région n'a pas le nombre de pools que le monde
  émet. Un protocole PER, qui n'émet ni alarme ni somesthésie, **ne peut pas construire de cerveau**.

**Le contrat sensoriel est fermé :** `params.ts:38-49` (`Sensation` a cinq champs nommés d'après
l'arène) ; `brain.ts:78-97` (`encodeSensation` déroule quatre canaux en dur et traite `INTERO` à part
— l'intéroception n'a aucun sens dans un protocole harnaché sans énergie).

**Le contrat moteur suppose la locomotion :** `params.ts:32-35` (`MotorAction`, union fermée de
quatre déplacements) ; `brain.ts:49-51` (`MOTOR.pools === ACTIONS.length`) ; `brain.ts:111-138` (course
au seuil à premier franchissement, remise à zéro globale, action par défaut au délai de garde — le
PER exige au contraire une **fenêtre de notation bornée**, sans action par défaut) ; `params.ts:299`
(`accDefault: "AVANCER"` : une abeille harnachée qui « avance par défaut » n'a aucun sens) ;
`organism.ts:103-104` (persistance d'action, indispensable à la locomotion, sans objet ici).

**La boucle appelle des fonctions concrètes :** `organism.ts:19`, `49-61`, `77`, `95`, `104`, et
`params.ts:304-311` (`OrganismParams.world` obligatoire — un organisme ne peut pas exister sans arène).

**Événements et métriques sont ceux de la survie :** `world.ts:13` (union fermée) ;
`metrics.ts:49-57` (branchement sur cette union) ; `metrics.ts:6-16` (durées de vie, ratio toxine) ;
`metrics.ts:75-88` (`splitHalves` découpe en moitiés de temps cumulé — correct pour des durées de
vie, **sans objet** pour des essais numérotés où la comparaison est essai 1 vs essai 5).

**Contraintes de topologie avant d'ajouter des régions :** `topology.ts:43-51` (`DISPOSITION` en
dur) ; `params.ts:9-17` (`RegionId`, union fermée de 8 noms) ; `topology.ts:54-60` (`CAPTEURS`) ;
`topology.ts:93-97` (**jette** si le cortex n'est pas majoritaire — ajouter des régions rapproche de
cette borne) ; `topology.ts:107` (l'ordre des régions est signifiant).

### L'interface proposée

Une seule abstraction, `Task`, qui remplace `world.ts` dans la boucle **sans le supprimer** :
l'arène devient une tâche parmi d'autres, ce qui préserve les acquis du lot 1 et le parcours
`/theorie`.

```
src/sim/
  task.ts              l'interface Task, le type Trial, le journal d'essais
  tasks/
    arena.ts           l'arène actuelle, ré-enveloppée dans Task (aucune perte)
    per.ts             harnais harnaché : PER, généralisation, discrimination
    ser.ts             harnais aversif (réutilise per.ts, fenêtre de notation propre)
    corridor.ts        odométrie, locomotion 1D
    homing.ts          intégration de trajet, locomotion 2D
    odors.ts           générateur d'odeurs paramétrique, calibré par la fiche de généralisation
    schedules.ts       calendriers : apparié, non apparié, inversé, différentiel
  protocols/
    runner.ts          boucle sujets × groupes × essais, journal
    stats.ts           Fisher exact, McNemar, tendance monotone
```

Quatre propriétés que ce contrat achète :

1. **La tâche déclare les régions dont elle a besoin**, et `createBrain` les construit. C'est
   l'inversion de dépendance qui fait disparaître `brain.ts:15`.
2. **Une frontière d'essai décidée par la tâche, pas par le cerveau.** L'arène répond toujours
   « continue » ; le harnais PER découpe en essais. C'est ce qui permet de cadencer l'homéostasie sur
   l'inter-essai (§4) sans que le cerveau sache ce qu'est un essai.
3. **Une lecture motrice remplace l'action fermée.** La tâche lit les accumulateurs et décide de leur
   sémantique : premier franchissement pour l'arène, franchissement-dans-une-fenêtre pour le PER,
   valeur continue pour le pilotage. `params.ts:32-35` cesse d'être un contrat global.
4. **Deux canaux de renforcement — appétitif et aversif — au lieu d'un scalaire signé.** Rend la
   fiche SER exprimable, et rend l'exigence visible **dans les types** plutôt qu'enfouie dans
   `plasticity.ts:154`.

Les trois coutures du lot 1 sont conservées et généralisées. **Ce que je ne toucherais pas** :
`lif.ts`, `topology.ts` hors ajout de régions, et la décroissance paresseuse de `plasticity.ts` —
indifférents à la tâche, et mesurés.

---

## 8. L'échelle : la limite est la mémoire, pas la vitesse

Deux calculs indépendants convergent (**calculé**, à partir du rapport de 59,75 arêtes par neurone
**mesuré** au lot 1) :

| n | arêtes | topologie | traces | **total** | ticks/s |
|---|---|---|---|---|---|
| 2 500 | 0,15 M | 3 Mo | 1 Mo | **4 Mo** | 7 493 (**mesuré**) |
| 50 000 | 2,99 M | 51 Mo | 24 Mo | **75 Mo** (**mesuré ≈ 72**) | 304 (**mesuré**) |
| 500 000 | 29,9 M | 512 Mo | 239 Mo | **751 Mo** | ≈ 30 |
| **960 000** (l'abeille) | **57,4 M** | **983 Mo** | **459 Mo** | **1 442 Mo** | ≈ 15 |

À 500 000 neurones on dépasse déjà de **2,5 fois** la borne d'arrêt de 300 Mo que le plan du lot 1
s'était fixée. À 960 000 on demande **1,4 Go de tableaux typés** dans un moteur JavaScript
mono-thread : impraticable dans un onglet, fragile même en Node. Et le débit extrapolé est
**optimiste** — il ignore la dégradation de cache, qui s'aggrave dès que le graphe cesse de tenir en
L3.

Conséquence pour la boucle de mesure : un protocole de 400 000 ticks passerait de **53 s par graine**
(n = 2 500, **mesuré**) à **≈ 7,4 h par graine** à n = 10⁶. **La cible du million détruit la boucle
de mesure**, qui est le principal actif méthodologique du projet.

**Conclusion à porter sans détour : l'échelle de l'abeille n'est pas un réglage de `n`, c'est un
changement de substrat** (WebGPU, wasm + SIMD, ou quantification des poids). Et c'est un chantier
**séparé** : toutes les fiches des rangs 1 à 5 tournent en dizaines de minutes à n = 2 500. On obtient
donc des résultats falsifiables sur les fonctions **maintenant**, à petite échelle. C'est le
découplage le plus utile de ce document.

### La contrainte que le rendu impose : le déterminisme

Le noyau est reproductible **au bit près** pour une graine donnée — l'un des trois seuls acquis du
lot 1. Toutes les preuves (gelé, yoked, lésion) reposent sur la possibilité de rejouer exactement la
même vie en ne changeant qu'une variable. Deux réserves :

1. **La garantie est probablement plus faible que le projet ne le croit.** Le noyau utilise
   `Math.log` / `Math.cos` (Box–Muller, dans le **câblage** via `topology.ts:63-66`, pas seulement
   dans le bruit), `Math.exp` (`plasticity.ts:49`) et `Math.cbrt` (`topology.ts:153`, qui fixe le
   découpage des régions). Les transcendantes ne sont **pas** spécifiées au bit près par ECMAScript :
   la reproductibilité vaut *sur le même moteur*, pas nécessairement entre machines ou versions. **À
   vérifier, pas à supposer.** Le passage à Ziggurat (§5.4) retire les transcendantes du chemin par
   tick et améliore donc la situation.
2. **Le GPU et le multi-thread cassent le bit-à-bit** (ordre de réduction des sommes flottantes,
   atomiques). Si le rendu à 10⁶ neurones les exige, alors **deux moteurs** : un moteur de preuve
   petit, mono-thread, bit-exact ; un moteur d'affichage rapide qui ne prouve rien. Risque principal :
   la divergence silencieuse, qui demande un test d'équivalence statistique.

Une analyse dédiée est en cours, incluant le calcul de puissance donnant le nombre de graines
nécessaire si le déterminisme est abandonné. **Ce document ne tranche pas ici** (§11, question 4).

---

## 9. Découpage en lots

Chaque lot a une porte **falsifiable**. Aucun lot ne commence avant que le précédent passe.

**Lot 0 — L'horloge et les préalables.** Fixer `dt = 1 ms`, re-dériver toutes les constantes depuis
des valeurs publiées, conditionner l'homéostasie par `lr`, remplacer Box–Muller par Ziggurat.
*Porte* : le régime reste dans les bornes de `calibration.probe.test.ts`, **et** le débit à
n = 50 000 dépasse 800 ticks/s (contre 534 **mesurés** sur la boucle LIF), **et** le témoin `lr = 0`
déplace zéro poids. Le lot le moins spectaculaire et le plus décisif.

**Lot 1 — La voie olfactive.** Glomérules → cellules de Kenyon → neurone de sortie, avec APL, sans
récurrence corticale, **sans homéostasie sur les poids**. Plasticité confinée à la couche de sortie.
*Porte* : reproduire la courbe de Bitterman avec au plus **deux** paramètres ajustés, et les trois
témoins au comportement annoncé. Les sondes du §5 disent que c'est atteignable ; le lot le prouve sur
un substrat impulsionnel complet.

**Lot 2 — Généralisation, puis SER et les deux voies.** D'abord calibrer l'espace des odeurs sur le
gradient 53/31/23. Puis séparer octopamine et dopamine en populations nommées.
*Porte* : la porte à trois volets du §6.3 rang 3, dont la **double dissociation par lésion**.

**Lot 3 — L'échelle réelle.** Monter les cellules de Kenyon à leur comptage publié, ajouter lobes
optiques et complexe central en populations **nommées mais non plastiques**.
*Porte* : les protocoles des lots 1 et 2 passent encore, avec les mêmes portes, à l'échelle complète.
Si un protocole ne passe plus, l'échelle a cassé quelque chose et on l'apprend là.

**Lot 4 — Le rendu**, sous la contrainte de déterminisme du §8.

**C'est au lot 3 que l'on cesse de mentir en disant « abeille ».** Avant, le mot désigne une voie
olfactive, pas un animal. À écrire ainsi dans l'interface.

---

## 10. Risques

| Risque | Gravité | Traitement |
|---|---|---|
| ~~La stabilité par rétroaction inhibitrice n'est pas testée sur substrat impulsionnel~~ | **résolu** | §5.5, trois volets mesurés : taux borné sur 100 000 ticks sans rééchelonnage, plasticité de sortie sans **aucun** effet sur la dynamique, pas d'oscillation avant ≈ 12× le gain utile. Seule contrainte restante : **borner le gain de l'APL** et documenter la borne. |
| Les sondes du §5.1 à 5.3 sont **rate-based**, sans LIF | **moyenne** (abaissée : §5.5 valide le substrat impulsionnel pour la stabilité, pas encore pour l'apprentissage) | Porte du lot 1 : refaire §5.3 sur le noyau impulsionnel complet. C'est le seul point où le document repose encore sur une transposition. |
| Les comptages anatomiques restent « à confirmer » | **élevée** | Aucun chiffre non sourcé dans le code. Population non confirmée = étiquetée **inventée**, dans le code et dans l'interface. |
| **Le sens de la plasticité KC → MBON** | **élevée** | Chez la drosophile, l'apprentissage appétitif **déprime** la synapse vers le neurone de sortie porteur de l'évitement. Mes sondes ont potentialisé. **Le sens doit venir de la littérature abeille avant l'implémentation**, pas d'un choix de commodité. |
| Mon espace d'odeurs est trop confusable | moyenne | Établi : deux odeurs indépendantes de la sonde 5.1 donnent 53 %, ce que la biologie donne pour un écart d'un seul carbone. La fiche de généralisation (rang 2) est le correctif, et elle doit passer avant les fiches à deux odeurs. |
| La règle de décision (réponse → probabilité de comportement) | moyenne | Son seuil vient d'un taux spontané **publié** ; son bruit est l'un des deux paramètres ajustés déclarés. Le taux spontané exact n'a **pas été retrouvé** dans les sources : à calibrer comme le régime l'a été au lot 1, et la porte porte sur le **contraste**, pas sur un niveau absolu. |
| La compression de l'ITI (facteur 75) | moyenne | Déclarée en §6.2, avec sa conséquence : la mémoire à long terme espacée sort du périmètre. Vérifier que l'ITI comprimé reste > 4 × `tauElig`. |
| Perte du parcours `/theorie` | faible | Inchangé. Le « mur du crédit » garde toute sa valeur — et le §4 explique enfin *de combien* la fenêtre était trop courte. |

---

## 11. Questions que seul Zaki peut trancher

1. **Le mot « abeille » avant le lot 3.** Assume-t-on de dire « voie olfactive d'abeille » jusqu'au
   lot 3, ou faut-il l'échelle complète avant d'employer le mot ?
2. **`dt = 1 ms` ou 10 ms.** À 1 ms le neurone est physiologique et un protocole coûte ≈ 22 min à
   n = 2 500 ; à 10 ms il coûte 2,2 min mais la membrane devient dix fois trop lente. Je recommande
   1 ms — la refonte perd son sens si le neurone cesse d'être réaliste pour gagner du temps machine.
3. **L'arène actuelle.** Devient-elle un harnais parmi d'autres (ma recommandation : rien n'est
   perdu), ou disparaît-elle ? Elle ne mesure aucun protocole réel, mais c'est elle qui produit
   l'image d'un organisme qui vit.
4. **Deux moteurs ou un.** Accepte-t-on un moteur d'affichage non déterministe distinct du moteur de
   preuve, avec le risque de divergence silencieuse ?
5. **La neurogenèse** (lecture 2 du §1) : périmètre ou ouverture ?

---

## 12. Fragilités de ce document

Si l'un de ces points est faux, la recommandation change.

- Les comptages de cellules de Kenyon et de glomérules sont **à confirmer**, et l'ambiguïté
  « par hémisphère ou au total » sur les cellules de Kenyon n'est **pas résolue**. Cela change
  l'échelle du lot 3, pas l'architecture.
- Le rapport `tauElig / tauM` biologique (50 à 1 000) vient de la littérature générale sur les traces
  d'éligibilité, pas d'une mesure chez l'abeille. Les deux chiffres abeille qui l'étayent (ISI
  optimal ≈ 3 s, latence dopaminergique 96 ms) sont solides ; **le rapport lui-même est une
  inférence.**
- L'extrapolation au-delà de n = 50 000 repose sur trois points mesurés, une hypothèse de linéarité
  en arêtes et la correction du poste de bruit en O(n). **Elle n'a pas été vérifiée** au-delà de
  n = 50 000, et elle est optimiste (dégradation de cache ignorée).
- La sonde APL (§5.5) tourne à 20 000 cellules de Kenyon, sans plasticité active dans le volet
  mesuré, et avec un APL **unique**. Un APL réel a une arborisation étendue et un décours propre.
- **Chiffres explicitement non retrouvés, à ne pas combler par extrapolation** : taux de réponse
  spontanée au CS avant conditionnement (PER et SER) ; nombre d'essais et taux résiduel de
  l'extinction ; pourcentages de rappel à 24 h et 72 h ; latence en millisecondes de la
  dépolarisation de VUMmx1 après stimulation sucrose ; précision angulaire du vecteur de retour chez
  l'abeille.
