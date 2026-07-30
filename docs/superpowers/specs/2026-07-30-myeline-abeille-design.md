# Myéline : l'abeille — refonder le modèle sur un animal réel

Date : 2026-07-30 · Branche : `vie` · Remplace l'anatomie de
`2026-07-30-myeline-vie-design.md`, conserve sa méthode

**Statut : conception soumise à revue. Rien n'est implémenté.**

Convention de ce document, héritée du journal de calibration : chaque chiffre porte son statut —
**mesuré** (dans cette session ou le journal), **publié** (avec sa source), **à confirmer**, ou
**inventé** (assumé comme tel). Aucun chiffre sans statut.

---

## 1. Le verdict

La demande était : revoir le modèle de développement des systèmes neuronaux pour le faire
correspondre à quelque chose de réel, avec pour objectif de simuler une abeille de 700 000 à
1 million de neurones et d'en retrouver les fonctions.

**Ce qu'il faut d'abord dire : la cible du million de neurones et l'échec du lot 1 ont la même
cause, et cette cause n'est pas l'échelle.**

Le lot 1 a échoué parce que la plasticité était **diffuse** (2,4 M d'arêtes de signes mêlés, sous un
rééchelonnage homéostatique cohérent qui produisait 93 à 96 % du mouvement synaptique — mesuré) et
parce que l'horloge du modèle était **incohérente** (§4). Aucun de ces deux défauts ne se corrige en
ajoutant des neurones. Les deux se corrigent en adoptant l'anatomie d'un animal réel.

Et symétriquement : le cerveau d'abeille compte ≈ 950 000 neurones (Witthöft 1967, **publié**), dont
la majorité sont dans les lobes optiques. Les cellules de Kenyon qui portent l'apprentissage
associatif y sont **éparses** — de l'ordre de 5 % actives par odeur (**publié**, à préciser §3) —
donc le noyau fonctionnel est petit et peu coûteux. **Atteindre 10⁶ neurones est un objectif de
complétude et de rendu, pas un objectif d'apprentissage.**

Cela n'invalide pas la cible de Zaki : cela la sépare en deux, et dit laquelle porte les fonctions.

### Les trois lectures de « modèle de développement »

La demande est ambiguë et le CLAUDE.md du dépôt exige de ne pas trancher silencieusement.

1. **Les règles génératives qui construisent le réseau** — `buildTopology`. C'est la lecture de
   premier degré vu « leur faire correspondre à quelque chose de réel » : remplacer la dalle
   corticale inventée par une construction ancrée sur des neuropiles nommés et comptés.
   **→ Lecture retenue.**
2. **La neurogenèse réelle** — ordre de naissance des cellules de Kenyon, couches concentriques du
   calice, rétinotopie des lobes optiques, maturation post-émergence. **→ Ouverture explicitement
   bornée** (§9), à n'implémenter que si les règles sont assez établies pour ne pas être une
   invention déguisée.
3. Le **modèle de développement logiciel** (les lots). **→ Écartée** : la phrase porte sur les
   systèmes neuronaux, pas sur la méthode de travail.

---

## 2. Ce que le modèle actuel est réellement

Le noyau `src/sim/` se présente comme un cerveau à huit régions. Il en a **une**.

Sur 50 000 neurones, **43 500 (87 %)** sont dans une dalle cubique torique à connectivité gaussienne
isotrope. Les 6 500 restants sont répartis en sept étiquettes qui n'ont **aucune connectivité
interne** : un « lobe olfactif » de 24 pools de 60 neurones où les 60 neurones d'un pool ne se
parlent pas et ne s'inhibent pas n'est pas un neuropile, c'est un vecteur d'entrée de dimension 24
étalé sur 1 440 unités (`topology.ts:43-51`, `257-268`).

Les six choix sans référent biologique :

| Choix | Emplacement | Pourquoi il ne correspond à rien |
|---|---|---|
| Dalle **torique** | `topology.ts:153`, `194-204` | Commodité de calcul (pas de bord). Aucun cerveau n'a de topologie périodique. |
| Connectivité gaussienne isotrope 3D | `topology.ts:269-278` | Approxime une tranche de cortex de mammifère. Un neuropile d'insecte est fait de faisceaux, de glomérules et de couches, pas d'un voisinage euclidien. |
| « CORTEX » majoritaire, imposé par une garde | `topology.ts:93-97` | L'insecte n'a pas de cortex. Le code **impose** l'erreur : il refuse de construire si la dalle n'est pas majoritaire. |
| `wInh = 15 × wExc` | `params.ts:96-97` | Valeur mesurée **pour stabiliser la dalle**, pas pour correspondre à une inhibition réelle. Le journal l'admet : l'équilibre repose sur l'amplitude, non sur le profil « mexican hat » annoncé. |
| Capteurs = 24 secteurs de cap | `world.ts:48-50` | C'est un capteur de robot. Une abeille n'a pas de résolution angulaire olfactive de 15°. |
| Région `VTA` | `topology.ts:50`, `236-238` | Structure de **vertébré**, et surtout : elle est une feuille **sans aucune arête sortante**, donc purement décorative. La dopamine effective est le scalaire `da` de `organism.ts:114`. |

Le dernier point est le symptôme de l'ensemble : **une région existe dans la topologie et ne fait
rien.** Des noms de structures posés à côté d'un calcul qui ne les utilise pas.

### Ce qui survit sans discussion

`lib/rng.ts` (déterministe), l'ordre du tick de `stepLif` (« non négociable », à juste titre), le
CSR bidirectionnel (`topology.ts:286-309`), la décroissance paresseuse par `lastTouch` + LUT
(`plasticity.ts:63-71`), les trois coutures de protocole de `organism.ts:39-47`
(`dopamineSource`, `onEvent`, `lesion`), et surtout la **discipline du journal de calibration**.
Cette discipline est le principal actif du projet, plus précieux que le code.

---

## 3. L'architecture proposée : la voie olfactive de l'abeille

Le principe : **on ne modélise pas un cerveau d'abeille, on modélise sa voie olfactive
d'apprentissage, à l'échelle réelle, et on nomme honnêtement ce qui manque.**

```
antennes ──▶ lobe antennaire ──▶ corps pédonculés ──────▶ neurones de sortie ──▶ muscle
             (glomérules,        (cellules de Kenyon,      (MBON)                (extension du
              neurones de         code épars)                                     proboscis)
              projection)              ▲   │
                                       │   ▼
                              APL ◀────┘  inhibition de rétroaction divisive
                                          (impose la sparsité DANS le tick)
                                       ▲
                      VUMmx1 (octopamine, appétitif) ──┤
                      dopamine (aversif) ──────────────┘
```

| Population | Rôle | Effectif réel | Statut du chiffre | Plastique |
|---|---|---|---|---|
| Neurones récepteurs olfactifs | transduction | — | à confirmer | non |
| Glomérules du lobe antennaire | décorrélation, normalisation | ≈ 160 | **à confirmer** | non |
| Neurones de projection | glomérule → calice | ≈ 800 | à confirmer | non |
| **Cellules de Kenyon** | code épars, ≈ 5 % actives | ≈ 160 000 par corps pédonculé | **à confirmer** (par côté ou au total ?) | **non** (entrée) |
| **APL** (rétroaction GABAergique) | normalisation divisive | 1 à quelques | publié qualitativement | non |
| **Neurones de sortie (MBON)** | lecture apprise | dizaines à centaines | à confirmer | **OUI — la seule couche plastique** |
| Corne latérale | voie innée, non apprise | — | à confirmer | non |
| **VUMmx1** | octopamine, renforcement appétitif | **1** | **publié** (Hammer 1993) | non |
| Neurones dopaminergiques | renforcement aversif | plusieurs sous-populations | **publié** (voir ci-dessous) | non |
| Lobes optiques | majorité du cerveau | ≈ 2/3 | à confirmer | **absents au lot 1** |
| Complexe central | cap, intégration de trajet | quelques milliers | à confirmer | absent au lot 1 |

**Les comptages marqués « à confirmer » ne doivent PAS entrer dans le code avant vérification
sourcée.** Toute population dont le comptage reste incertain est étiquetée **inventée** dans le code
et dans l'interface — c'est le standard du projet, appliqué à l'anatomie.

### Les trois différences structurelles qui règlent l'échec du lot 1

**a) La plasticité est confinée.** Une seule couche est plastique : cellules de Kenyon → neurones de
sortie. Ce n'est pas une simplification, c'est ce que la biologie décrit. Le signal d'apprentissage
cesse alors d'être dilué dans un réservoir récurrent.

**b) La sparsité est imposée DANS le tick, pas sur les poids.** L'APL est une boucle d'inhibition
de rétroaction divisive : elle réduit l'activité **au tick courant** sans jamais réécrire une
synapse. Elle remplace `homeostasis()` (`plasticity.ts:181-208`), qui était la cause mesurée de
l'écrasement de l'apprentissage. C'est le changement le plus important du document.

**c) Le renforcement n'est pas un scalaire.** La littérature établit une double dissociation :
octopamine = appétitif (VUMmx1, Hammer 1993 ; bloquer le récepteur AmOA1 empêche l'acquisition sans
altérer la discrimination olfactive — Farooqui et al. 2003), dopamine = aversif (spipérone bloque le
conditionnement SER, SCH23390 non, les antagonistes octopaminergiques sont sans effet — Vergoz
et al. 2007). **Tous publiés.**

Mais un même neuromodulateur porte **deux fonctions de signes opposés** : la dopamine est
instructive dans l'apprentissage associatif *et* répressive sur le gain de réactivité nociceptive
(Tedjakumala et al. 2014, **publié** — le flupentixol *augmente* la sensibilité au choc).
**Conséquence directe pour l'architecture : une variable « dopamine globale » unique ne peut pas
porter les deux.** Il faut au minimum deux voies nommées, et cela condamne le `da` scalaire de
`organism.ts:114`.

---

## 4. La base de temps : le premier acte, avant toute anatomie

C'est le résultat le plus important de cette revue, et il est indépendant de l'anatomie.

Le projet a choisi de n'affirmer aucune correspondance tick → seconde (`params.ts:3-5`). Choix
raisonnable — mais jamais vérifié : **il n'existe aucune valeur du tick rendant les constantes
actuelles simultanément plausibles.**

| constante | valeur | si 1 tick = 1 ms | si 1 tick = 100 ms |
|---|---|---|---|
| `tauM` (membrane) | 20 ticks | 20 ms ✔ | 2 s ✘ |
| `tauS` | 5 ticks | 5 ms ✔ | 500 ms ✘ |
| délais axonaux | 1–8 ticks | 1–8 ms ✔ | 0,1–0,8 s ✘ |
| `tauElig` (fenêtre de crédit) | 60 ticks | 60 ms ✘ | 6 s ✔ |
| `homeoEvery` | 500 ticks | 0,5 s ✘ | 50 s ✔ |

Le rapport qui gouverne l'attribution temporelle du crédit est `tauElig / tauM` :

- noyau actuel : 60 / 20 = **3** (**mesuré**, lecture directe de `params.ts`)
- biologie : membrane 10–20 ms, éligibilité / marquage synaptique 1–10 s → **50 à 1 000**
- abeille, chiffres spécifiques : intervalle CS-US antérograde optimal ≈ **3 s** (Giurfa et al.
  2009, **publié**) ; pic de dopamine dans les corps pédonculés à **96 ± 12,8 ms** après le choc,
  clairance à 25 % en **472 ± 136 ms** (Jarriault et al. 2018, **publié**)

**Le noyau est environ 50 fois trop court.** Cela réhabilite l'hypothèse 2 du journal de calibration
(« la fenêtre de crédit est trop courte », classée *partiellement écartée*) : elle n'était pas
partiellement vraie, elle était vraie d'un facteur 50 — et le journal ne pouvait pas le voir, faute
d'unité de référence.

**Décision : fixer `dt = 1 ms` explicitement**, puis re-dériver toutes les constantes depuis des
valeurs publiées en secondes, et vérifier que le régime survit à la porte de calibration existante.
Ce n'est pas un réglage : à 60 ticks l'éligibilité ne peut créditer qu'un réflexe ; à 3 000 ticks
elle peut créditer une manœuvre.

Coût : la LUT de décroissance passe de 241 à 12 001 entrées (`plasticity.ts:49`) — en O(τ), pas en
O(arêtes), donc négligeable. En revanche `dumpEvery = 16` devient absurdement fréquent face à une
fenêtre de 3 000 ticks et doit être re-dérivé.

---

## 5. Ce qui a déjà été mesuré pour valider cette conception

Quatre sondes jetables ont été exécutées **avant** d'écrire ce document, précisément parce que
l'affirmer sans mesure aurait répété l'erreur du lot 1. Scripts hors dépôt, déterministes.

### 5.1 Le confinement rend l'apprentissage audible (**mesuré**)

Dispositif : 160 glomérules → 2 000 cellules de Kenyon (10 afférences chacune) → 1 neurone de
sortie, sparsité de 5 % imposée par seuil global, plasticité **uniquement** sur les 2 000 synapses
de sortie. Conditionnement différentiel A+/B−, 12 essais, 5 graines.

| essai | plastique | gelé (`lr` = 0) | yoked |
|---|---|---|---|
| 0 | −0,018 ± 0,094 | −0,018 ± 0,094 | −0,018 ± 0,094 |
| 3 | **+0,218 ± 0,100** | −0,018 ± 0,094 | −0,249 ± 0,133 |
| 12 | **+0,929 ± 0,137** | −0,018 ± 0,094 | −0,940 ± 0,255 |

Synapses déplacées : **99 / 2 000 (5,0 %)** en plastique, **0 / 2 000 en gelé**.

Trois écarts avec le lot 1, tous structurels :

1. **Rapport signal / dispersion = 6,8** à l'essai 12 (0,929 / 0,137). Au lot 1, l'effet cherché
   (×1,17) était du même ordre que la dispersion : rien n'était concluant.
2. **Le témoin gelé est réellement gelé** — 0 synapse déplacée. Au lot 1 il bougeait 93 à 96 %
   autant que le plastique, parce que l'homéostasie n'était pas conditionnée par `lr` : la
   comparaison était vide de sens.
3. **Le témoin yoked part dans le sens inverse** (−0,940). Il sépare enfin « apprendre » de
   « recevoir du signal », ce que la conception annonçait comme le témoin qui compte.

### 5.2 Le mécanisme reproduit l'asymétrie temporelle publiée (**mesuré**, non ajusté)

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
mécanisme, pas un réglage. La forme de la courbe (avant efficace, arrière inefficace, optimum
intermédiaire) est celle qui est publiée chez l'abeille, et **aucun paramètre n'a été ajusté pour
l'obtenir**.

Retombée : cette courbe fournit le premier moyen honnête d'ancrer le tick au temps biologique. Si
l'intervalle CS-US optimal publié vaut X secondes et que l'optimum du modèle est à 40 ticks, alors
1 tick ≈ X/40 s — une **ancre mesurée**, pas une convention posée.

### 5.3 Le modèle atteint la courbe d'acquisition publiée (**mesuré**)

Référence : Bitterman, Menzel, Fietz & Schäfer 1983, via Giurfa & Sandoz 2012 Fig. 4 (**publié**) —
groupe apparié ≈ **80 % de réponse à l'essai 3**, groupe non apparié **plat proche de 0 %**.

120 « abeilles », chacune avec son câblage et ses odeurs. Règle de décision : seuil sur la réponse
du neurone de sortie, seuil déduit d'un **taux spontané publié**.

| `lr` | essai 1 | essai 2 | **essai 3** | essai 8 |
|---|---|---|---|---|
| 0,05 | 11 % | 22 % | 42 % | 78 % |
| **0,15** | 11 % | 62 % | **≈ 80 %** | 100 % |
| 0,40 | 11 % | 86 % | 100 % | 100 % |

Et le témoin non apparié suit **exactement** le taux spontané visé, indépendamment de `lr` — preuve
directe qu'il ne contient aucun apprentissage :

| taux spontané visé | apparié essai 3 | témoin non apparié (max) |
|---|---|---|
| 10 % | 73 % | 17 % |
| **3 %** | **67 %** | **7 %** |
| 3 % (bruit réduit) | 91 % | 4 % |

**Position méthodologique, à inscrire comme règle du projet : deux paramètres ajustés (`lr`,
amplitude du bruit de décision) contre cinq propriétés prédites** — asymétrie avant/arrière,
optimum d'intervalle, gradient de généralisation (100 % → 79 % → 53 % **mesuré**), témoin gelé plat,
témoin yoked inversé. **Le nombre de paramètres ajustés doit être déclaré et rester inférieur au
nombre de propriétés prédites.**

### 5.4 Le bruit gaussien est le premier poste de coût, et il ignore les arêtes (**mesuré**)

`lif.ts:42-45` tire un gaussien par Box–Muller (`Math.log` + `Math.cos` + `Math.sqrt` + 2 appels
RNG) pour **tous** les n neurones à chaque tick. Coût isolé : **22,44 ns par tirage**.

Sur le vrai noyau, boucle LIF, régime inchangé (0,0213 contre 0,0214 décharge/neurone/tick) :

| n | arêtes | Box–Muller | table précalculée | part du bruit |
|---|---|---|---|---|
| 12 000 | 717 440 | 2 889 ticks/s | 5 983 ticks/s | **51,7 %** |
| 50 000 | 2 987 520 | 534 ticks/s | 1 361 ticks/s | **60,7 %** |

Le journal (tâche 8) attribuait 17 % au balayage dopaminergique et raisonnait comme si les arêtes
gouvernaient la montée en échelle. **Plus de la moitié du temps part dans un poste proportionnel à
n**, que réduire le fan-out ne fera pas baisser. À n = 10⁶, le bruit seul plafonne à **44,6 ticks/s,
même avec zéro synapse.**

Réserve : la table de 65 536 tirages mesure le coût, elle ne le résout pas (elle se répète et
introduit des corrélations). Le remplacement à retenir est l'algorithme **Ziggurat** (aucune
transcendante dans ~98 % des tirages), à valider par un test de régime contre le Box–Muller.

---

## 6. Le banc de tâches : trois fonctions, trois portes réelles

« Retrouver les fonctions » n'a de sens que si chaque fonction dispose d'un harnais qui la mesure.
L'arène actuelle (`world.ts` : pastilles, prédateur, énergie) ne permet de mesurer **aucun**
protocole réel d'abeille. Elle doit devenir **un harnais parmi plusieurs**, pas le monde.

Découverte décisive : **le conditionnement PER se fait sur une abeille harnachée, donc sans aucune
locomotion.** Le harnais est radicalement plus simple que l'arène : présenter une odeur, délivrer un
renforcement, lire une sortie motrice. Cela supprime d'un coup les trois défauts structurels que la
tâche 7 du journal avait dû corriger (course au seuil qui ne décidait jamais, organisme immobile
3,4 % du temps, densité du monde).

| Fonction | Harnais | Locomotion | Référence | Porte | Témoin |
|---|---|---|---|---|---|
| **PER appétitif** | odeur (CS) puis sucrose (US), ISI ≈ 3 s, 6–8 essais | **non** | Bitterman 1983 : ≈ 80 % à l'essai 3, non apparié plat | taux de réponse au CS+ ≥ 60 % à l'essai 5, témoin non apparié ≤ 15 % | non apparié, gelé, yoked |
| **Discrimination A+/B−** | deux odeurs, une renforcée | **non** | Deisig 2001 (éléments M ≈ 41–47 %) | discrimination croissante, monotone sur ≥ 4 points, effet ≥ 3 σ | gelé, yoked |
| **SER aversif** | odeur (CS) 5 s, choc 7,5 V / 60 Hz / 2 s, ISI 3 s, 6 essais | **non** | Vergoz 2007 : apparié F(5,190)=8,46 p<0,0001 ; non apparié non significatif | acquisition significative en apparié, absente en non apparié | non apparié |

Le SER porte une exigence architecturale supplémentaire, et c'est pour cela qu'il figure ici : il
**oblige** à séparer les deux voies de renforcement. Un modèle qui n'a qu'un scalaire `da` ne peut
pas produire à la fois une acquisition appétitive et une acquisition aversive dissociables
pharmacologiquement.

### Ce qui est explicitement HORS des portes, et pourquoi

- **Le blocage.** Guerrieri, Lachnit, Gerber & Giurfa 2005 : blocage trouvé dans **4 combinaisons
  sur 24**, sur ≈ 1 000 abeilles en design équilibré (**publié**). En vol libre, Blaser et al. 2006
  montrent un artefact de « pseudoblocage ». **Une porte que l'animal lui-même échoue n'est pas une
  porte.**
- **Les inversions multiples.** Mota & Giurfa 2010 : une inversion réussie par 34 abeilles sur 76
  apprenantes, et les inversions suivantes **se dégradent** — pas de « learning-to-learn »
  (**publié**). Le modèle ne doit donc pas être noté sur une amélioration qui n'existe pas.
- **La rétention à 24–72 h, et les effets massé / espacé.** Ils dépendent de la consolidation
  (synthèse protéique — Tedjakumala & Giurfa 2013, **publié**), qui n'est pas modélisée. Conséquence
  directe : les intervalles inter-essais sont **sautés** et non simulés, ce qui est exact tant que
  l'éligibilité y est éteinte, et **faux** dès qu'on voudra la consolidation. À déclarer, pas à
  cacher.
- **La danse en huit, la colonie, le vol.** Hors de portée d'un cerveau isolé sans corps complet.

---

## 7. Découpage en lots

Chaque lot a une porte **falsifiable**. Aucun lot ne commence avant que le précédent passe.

**Lot 0 — L'horloge (§4).** Fixer `dt = 1 ms`, re-dériver toutes les constantes depuis des valeurs
publiées, re-passer la porte de calibration existante. Remplacer Box–Muller par Ziggurat.
*Porte* : le régime mesuré reste dans les bornes de `calibration.probe.test.ts`, **et** le débit à
n = 50 000 dépasse 800 ticks/s (contre 534 mesurés aujourd'hui sur la boucle LIF).
*C'est le lot le moins spectaculaire et le plus décisif : sans lui tout le reste tourne sur une
horloge incohérente.*

**Lot 1 — La voie olfactive.** Glomérules → cellules de Kenyon → neurone de sortie, avec APL, sans
récurrence corticale, sans homéostasie sur les poids. Plasticité confinée à la couche de sortie.
*Porte* : reproduire la courbe de Bitterman (§6) avec au plus **deux** paramètres ajustés, et les
trois témoins (non apparié, gelé, yoked) au comportement annoncé. Les sondes de §5 disent que c'est
atteignable ; elles ne le prouvent pas sur un substrat impulsionnel.

**Lot 2 — Le SER et les deux voies de renforcement.** Séparer octopamine et dopamine en deux
populations nommées, avec leurs cibles distinctes.
*Porte* : acquisition appétitive et aversive toutes deux présentes, et **une lésion sélective d'une
voie n'abolit que l'apprentissage correspondant** — l'équivalent computationnel de la double
dissociation pharmacologique de Vergoz 2007.

**Lot 3 — L'échelle réelle.** Monter les cellules de Kenyon à leur comptage publié, ajouter les
lobes optiques et le complexe central en populations **nommées mais non plastiques**.
*Porte* : les protocoles du lot 1 passent encore, avec les mêmes portes, à l'échelle complète. **Si
un protocole ne passe plus, l'échelle a cassé quelque chose et on l'apprend là.**

**Lot 4 — Le rendu.** Rendre visible ce qui est vrai. Voir §8 pour la contrainte de déterminisme.

**C'est au lot 3 que l'on cesse de mentir en disant « abeille »** — avant, le mot désigne une voie
olfactive, pas un animal. À écrire ainsi dans l'interface.

---

## 8. La question ouverte que le rendu impose : le déterminisme

Le noyau est reproductible **au bit près** pour une graine donnée, et c'est l'un des trois seuls
acquis du lot 1. Toutes les preuves du projet — gelé, yoked, lésion — reposent sur la possibilité de
rejouer exactement la même vie en ne changeant qu'une variable.

Deux réserves à trancher avant de choisir une stratégie de calcul :

1. **La reproductibilité actuelle est probablement moins garantie que le projet ne le croit.** Le
   noyau utilise `Math.log` / `Math.cos` (Box–Muller, dans le **câblage** via `topology.ts:63-66`,
   pas seulement dans le bruit), `Math.exp` (LUT, `plasticity.ts:49`) et `Math.cbrt`
   (`topology.ts:153`, qui fixe le découpage des régions). Les fonctions transcendantes ne sont
   **pas** spécifiées au bit près par ECMAScript. La reproductibilité vaut donc *sur le même moteur*,
   pas nécessairement entre machines ou entre versions de Node. À vérifier, pas à supposer.
   *Effet de bord favorable du passage à Ziggurat (§7, lot 0) : il retire les transcendantes du
   chemin par tick.*
2. **Le GPU et le multi-thread cassent le bit-à-bit** (ordre de réduction des sommes flottantes,
   atomiques). Si le rendu à 10⁶ neurones les exige, alors **deux moteurs** : un moteur de preuve
   petit, mono-thread, bit-exact ; un moteur d'affichage rapide qui ne prouve rien. Le risque est la
   divergence silencieuse entre les deux, et il faut un test d'équivalence statistique pour la
   détecter.

Une analyse dédiée est en cours sur ces deux points, y compris le calcul de puissance donnant le
nombre de graines nécessaire si le déterminisme est abandonné. **Ce document ne tranche pas ici.**

---

## 9. Risques

| Risque | Gravité | Traitement |
|---|---|---|
| **Les sondes de §5 sont sans LIF et sans récurrence.** La thèse « la sparsité par rétroaction APL remplace l'homéostasie » n'a **pas** été testée sur un substrat impulsionnel récurrent. | **élevée** | Mesure qui la règle, à faire au lot 1 : sur le noyau impulsionnel, vérifier que l'APL seule maintient le taux de décharge des cellules de Kenyon dans les bornes de la porte de calibration sur 10⁶ ticks, **sans aucune mise à l'échelle des poids**. Si elle échoue, la conception est fausse et il faut le savoir au lot 1, pas au lot 3. |
| Les comptages anatomiques restent « à confirmer » | élevée | Aucun chiffre non sourcé n'entre dans le code. Population non confirmée = étiquetée **inventée**, dans le code et dans l'interface. |
| `dt = 1 ms` rend les protocoles longs | moyenne | Les intervalles inter-essais sont sautés (§6). Chiffrer le coût réel avant de s'engager : un essai PER ≈ 5 000 ticks, 8 essais ≈ 40 000 ticks — négligeable aux débits mesurés. |
| La règle de décision (réponse → probabilité de comportement) est fragile | moyenne | Son seuil vient d'un taux spontané **publié**, pas d'un ajustement. Son bruit est l'un des deux paramètres ajustés déclarés. |
| Le sens de la plasticité KC → MBON | moyenne | Chez la drosophile, l'apprentissage appétitif **déprime** la synapse vers le neurone de sortie porteur de l'évitement. Mes sondes ont potentialisé. **Le sens doit venir de la littérature abeille avant l'implémentation**, pas d'un choix de commodité. |
| Perte du parcours `/theorie` | faible | Inchangé, il reste l'archive honnête du chemin. Le « mur du crédit » garde toute sa valeur — et §4 explique enfin *de combien* la fenêtre était trop courte. |

---

## 10. Les deux architectures écartées

- **« Fidélité d'abord »** — viser les ≈ 950 000 neurones neuropile par neuropile dès le départ,
  simulation headless, navigateur en relecture. Écartée : à fan-out inchangé, 10⁶ neurones donnent
  ≈ 15 ticks/s (**extrapolé** de trois points mesurés) et ≈ 1,5 Go, soit **7,4 h par graine** pour
  un protocole de 400 000 ticks, contre 53 s aujourd'hui. Cela détruit la boucle de mesure qui est
  l'actif du projet, et n'achète aucune fonction.
- **« Chemin incrémental pur »** — transformer la dalle progressivement sans jamais la remplacer.
  Écartée : la dalle est précisément la structure qui dilue l'apprentissage. La transformer par
  petits pas revient à retuner ce que le journal a déjà mesuré comme non retunable.

---

## 11. Questions que seul Zaki peut trancher

1. **Le mot « abeille » avant le lot 3.** Assume-t-on de dire « voie olfactive d'abeille » jusqu'au
   lot 3, ou faut-il atteindre l'échelle complète avant d'employer le mot ?
2. **Fidélité contre boucle de mesure.** Si l'échelle complète coûte des heures par graine,
   privilégie-t-on le nombre de neurones affiché ou le nombre de protocoles démontrés ?
3. **L'arène actuelle.** Devient-elle un harnais parmi d'autres, ou disparaît-elle ? (Elle ne mesure
   aucun protocole réel, mais c'est elle qui produit l'image d'un organisme qui vit.)
4. **Deux moteurs ou un.** Accepte-t-on un moteur d'affichage non déterministe distinct du moteur de
   preuve, avec le risque de divergence silencieuse ?
5. **La neurogenèse** (lecture 2 du §1) est-elle dans le périmètre, ou une ouverture ?

---

## 12. Fragilités de ce document

Si l'un de ces points est faux, la recommandation change :

- Les comptages de cellules de Kenyon et de glomérules sont **à confirmer**. S'ils sont très
  différents, l'échelle du lot 1 change (mais pas l'architecture).
- Le rapport `tauElig / tauM` biologique (50 à 1 000) vient de la littérature générale sur les
  traces d'éligibilité, pas d'une mesure chez l'abeille. Les deux chiffres abeille qui l'étayent
  (ISI optimal ≈ 3 s, latence dopaminergique 96 ms) sont solides ; le rapport lui-même est une
  inférence.
- Les sondes de §5 sont **rate-based**. Leur transposition à un substrat impulsionnel est
  l'hypothèse la plus lourde du document, et le risque n° 1 la nomme.
- L'extrapolation à 10⁶ neurones repose sur trois points mesurés et une hypothèse de linéarité en
  arêtes, corrigée du poste de bruit en O(n). Elle n'a pas été vérifiée au-delà de n = 50 000.
