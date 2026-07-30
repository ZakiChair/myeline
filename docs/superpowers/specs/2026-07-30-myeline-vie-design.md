# Myéline : Vie — refonte autour d'un objectif de survie

Date : 2026-07-30 · Branche : `vie`

## 1. L'objectif

**Un réseau de 30 000 à 50 000 neurones est le cerveau d'un organisme qui doit rester en
vie. On voit ses décisions se former, et on voit ses comportements de survie apparaître.**

C'est la seule chose que l'application doit démontrer. Tout ce qui ne sert pas cette phrase
sort du chemin principal.

Trois conséquences immédiates :

1. **Le réseau doit être la cause du comportement.** Pas une décoration animée à côté d'une
   politique codée en dur. Si on éteint une partie du réseau, le comportement doit se
   dégrader de façon prévisible. C'est le test décisif (§6, lésion).
2. **Le comportement doit être mesurable.** « Comportement de survie » = durée de vie
   croissante, énergie moyenne croissante, ratio nourriture/toxine qui s'inverse, fuite du
   prédateur qui se raccourcit. Des courbes, pas des impressions.
3. **La décision doit être visible dans le temps.** Une course au seuil entre pools moteurs
   (accumulation de preuve → franchissement → action) montre l'instant du choix. Un simple
   argmax le cacherait.

### Ce que le projet actuel apporte, et ce qui doit changer

L'acquis (à conserver) : `scale-engine.ts` (automate excitable en typed-arrays, loi de Dale,
Hebb/STDP, mort/naissance), `reservoir.ts`, les 6 preuves seedées de `theorie-results.ts`, et
le parcours `/theorie` qui documente honnêtement le **mur du crédit** — l'incapacité du
substrat à relier une récompense tardive à l'action qui l'a causée.

Le contournement retenu à l'époque : sortir l'apprentissage du réseau (readout linéaire
appris par REINFORCE sur un réservoir figé). C'est correct mais ça plafonne : le réseau ne
survit pas, il n'est qu'un transformateur de features.

Ce qui change pour cette refonte :

| Sujet | Avant | Maintenant |
|---|---|---|
| Neurone | binaire, seuil sur la fraction de voisins excités | LIF à potentiel gradué, seuil adaptatif |
| Apprentissage | readout linéaire hors réseau | règle à trois facteurs **dans** les synapses |
| Crédit temporel | trace d'éligibilité sur le readout | trace d'éligibilité **par synapse** × dopamine |
| Taille utile | 300 (réservoir) | 30 000 – 50 000 |
| Décision | argmax softmax | course au seuil entre pools moteurs |
| Enjeu | atteindre une pastille | rester en vie |

Le parcours `/theorie` reste en place : c'est l'archive honnête du chemin parcouru, et le mur
du crédit y garde toute sa valeur pédagogique. Le nouveau noyau vit dans `src/sim/`, sans
toucher aux modules existants.

## 2. Le neurone et la synapse

**LIF (intègre-et-décharge à fuite)** par neurone `i` :

```
v[i] += (-(v[i] - vRest)/τm + iSyn[i] + bias[i] + bruit) · dt
si v[i] ≥ thr[i]  →  décharge, v[i] = vReset, refrac[i] = R, thr[i] += thrJump
thr[i] += (thrBase - thr[i]) / τthr        (retour lent au seuil de base)
iSyn[i] *= exp(-dt/τs)                     (courant synaptique à fuite)
```

Le seuil adaptatif (`thrJump`, τthr) est le frein qui empêche un neurone de monopoliser
l'activité — indispensable à 50 000 neurones, où une seule cellule emballée contamine tout.

**Loi de Dale** : 80 % excitateurs (poids > 0), 20 % inhibiteurs (poids < 0), fixé à la
construction. Un neurone ne change jamais de signe.

**Délais axonaux** : chaque synapse porte un délai de 1 à 8 ticks. Livraison par tampon
circulaire `ring[D][N]` : une décharge de `i` à `t` ajoute `w[e]` dans
`ring[(t + delay[e]) % D][target[e]]`, et le tick `t` consomme `ring[t % D]`. Les délais ne
sont pas cosmétiques : sans eux, aucune structure temporelle n'est apprenable (la STDP a
besoin que « avant » et « après » soient distinguables).

## 3. La topologie

CSR **dans les deux sens**, partageant le même tableau de poids :

- sortant : `outOffsets[N+1]`, `outTarget[E]`, `outDelay[E]` — pour propager les décharges.
- entrant : `inOffsets[N+1]`, `inSource[E]`, `inEdge[E]` → indice dans `w[]` — pour la
  potentialisation côté post-synaptique et pour la mise à l'échelle homéostatique.

Coût mémoire à N = 50 000, K = 64 sorties/neurone (E = 3,2 M) :
`w` 12,8 Mo + `elig` 12,8 Mo + `lastTouch` 12,8 Mo + CSR ≈ 40 Mo → **≈ 80 Mo**. Acceptable.

La topologie est **figée pendant la vie** (pas de mort/naissance) : on veut isoler
l'apprentissage synaptique comme cause du comportement. Le développement structural reste
une ouverture, pas un ingrédient.

### Régions

Le réseau n'est pas homogène — d'abord parce que c'est plus juste, ensuite parce qu'on veut
*voir* des régions s'allumer.

| Région | Rôle | Taille (N = 50 k) |
|---|---|---|
| `OLF_FOOD` | 24 secteurs × 60 — odeur de nourriture, codage par population | 1 440 |
| `OLF_TOXIN` | 24 × 60 — odeur de toxine (indiscernable *a priori* de la nourriture) | 1 440 |
| `ALARM` | 16 × 50 — signature du prédateur | 800 |
| `SOMA` | 8 × 40 — contact / collision | 320 |
| `INTERO` | 12 × 40 — énergie interne, codée par population | 480 |
| `CORTEX` | dalle 3D récurrente, connectivité décroissante avec la distance | ≈ 43 500 |
| `MOTOR` | 4 pools × 500 — gauche, droite, avancer, s'arrêter | 2 000 |
| `VTA` | 20 — dopamine, activité ∝ erreur de prédiction de récompense | 20 |

La connectivité corticale suit une gaussienne sur la distance 3D (excitation locale,
inhibition plus large : profil « mexican hat »). C'est ce qui produit les ondes voyageuses et
les avalanches — le rendu visuel de la criticité, gratuitement.

Les capteurs projettent vers le cortex avec un biais spatial (chaque modalité arrive dans un
territoire distinct), et le cortex projette vers les pools moteurs. Aucun câblage
capteur→moteur direct : le comportement **doit** traverser le cortex, sinon la lésion
corticale ne prouverait rien.

## 4. L'apprentissage : règle à trois facteurs

Trois quantités par synapse ou par neurone :

- `preTrace[i]`, `postTrace[j]` : traces de décharge par neurone, décroissance τ ≈ 20 ticks.
- `elig[e]` : trace d'éligibilité par synapse, τe ≈ 60 ticks. Elle enregistre la
  *coïncidence causale* sans encore modifier le poids.
- `da` : dopamine globale, calculée à partir de l'erreur de prédiction de récompense.

```
décharge de i  →  pour chaque sortie e = i→j :  elig[e] -= A_moins · postTrace[j]   (LTD)
décharge de j  →  pour chaque entrée e = i→j :  elig[e] += A_plus  · preTrace[i]    (LTP)
à la dopamine  →  w[e] += lr · da · elig[e]
```

Sans dopamine, rien n'est appris : l'éligibilité s'évanouit. C'est précisément ce qui franchit
le mur du crédit — la synapse garde une trace de « j'ai peut-être contribué », et le
neuromodulateur, arrivant plus tard, décide si ça valait la peine.

**Décroissance paresseuse.** Décrémenter 3,2 M de traces à chaque tick coûterait plus que la
simulation elle-même. On stocke `lastTouch[e]` et on applique `elig[e] *= LUT[t - lastTouch[e]]`
au moment où on touche l'arête, la table de correspondance saturant à 0 au-delà de 4·τe. Exact
au flottant près, et on ne paie que les arêtes réellement actives.

**Application de la dopamine.** `da` est accumulée et déversée toutes les 16 ticks (ou
immédiatement si |da| dépasse un seuil), par un balayage complet des E arêtes. 3,2 M
opérations toutes les 16 ticks ≈ 3 % du budget. Simple, exact, sans registre d'arêtes touchées.

**Homéostasie.** Toutes les 500 ticks, mise à l'échelle multiplicative des poids entrants de
chaque neurone vers un taux de décharge cible (≈ 5 Hz). Sans elle, un réseau de 50 000 neurones
soumis à une plasticité récompensée part en crise épileptique ou s'éteint en quelques secondes.
Ce n'est pas un détail de réglage, c'est ce qui rend le régime viable.

**Dopamine = erreur de prédiction.** `da = r - rBar` où `rBar` est une moyenne glissante des
récompenses. Un événement attendu ne produit plus de signal : l'organisme cesse d'apprendre ce
qu'il sait déjà, et une surprise négative (toxine) creuse le poids des synapses qui y ont mené.

## 5. Le monde et l'enjeu

Arène carrée avec murs. L'organisme a une position, un cap, une énergie.

- **Nourriture** (vert) : régénère par taches. `energy += 22`, `r = +1`.
- **Toxine** (violet) : *même signature olfactive de départ*, canal distinct.
  `energy -= 30`, `r = -1.4`. La distinction doit être apprise.
- **Prédateur** : poursuit l'organisme sous un rayon de détection. Contact : `energy -= 45`,
  `r = -2`. Émet dans `ALARM` avec une portée plus grande que sa vitesse — la fuite est
  apprenable.
- **Métabolisme** : `energy -= 0,05` par tick au repos, `-0,18` en déplacement. Bouger coûte,
  donc « s'arrêter » est une action utile quand rien ne vaut le déplacement.
- **Mort** à `energy ≤ 0` → réapparition au centre, énergie remise à 60, **cerveau conservé**.
  On enregistre la durée de vie. L'apprentissage est continu sur la vie entière de l'agent.

Encodage sensoriel : pour chaque modalité, l'intensité perçue dans le secteur `b` module le
taux d'injection de courant dans le pool `b` (codage par population, pas de clamp binaire).
L'intéroception encode l'énergie par un pic de population glissant sur les 12 pools —
l'organisme *sent* sa faim, et la faim peut donc moduler la décision.

Décodage moteur : chaque pool moteur intègre son propre taux de décharge (`acc[k] += rate[k] - fuite`).
Le premier pool à franchir `ACC_SEUIL` gagne, exécute son action, et tous les accumulateurs
sont remis à zéro. **C'est là que se lit le choix** : on voit la preuve s'accumuler puis
basculer. Un plafond de temps force une action par défaut si aucun pool ne tranche.

## 6. Les preuves

Rien de tout cela ne compte si le réseau n'est pas la cause. Quatre protocoles headless,
seedés, exécutés en test :

1. **Apprentissage** : sur une même graine, la durée de vie médiane de la seconde moitié de
   l'expérience dépasse la première d'un facteur ≥ 1,5, et le ratio toxines/nourritures
   ingérées baisse d'au moins la moitié.
2. **Témoin gelé** : plasticité coupée (`lr = 0`), tout le reste identique → pas de
   progression (la pente ne se distingue pas de zéro).
3. **Témoin yoked** : la dopamine reçue est le calendrier *rejoué d'un autre agent*,
   décorrélé des actions présentes → pas de progression. Ce témoin est celui qui compte : il
   distingue « apprendre » de « recevoir du signal ».
4. **Lésion** : après convergence, on éteint les 2 % de neurones corticaux dont l'activité
   corrèle le plus avec les rencontres de toxine → la consommation de toxine remonte
   significativement, alors qu'une lésion d'un nombre égal de neurones tirés au hasard ne le
   fait pas. C'est la démonstration que l'aversion est *localisée dans le réseau*.

Chaque protocole est aussi jouable dans l'interface, avec sa courbe. Les seuils annoncés sont
ceux des assertions ; les valeurs observées sont affichées à côté, comme dans
`theorie-results.ts`. Aucun chiffre n'est écrit dans la documentation avant d'avoir été mesuré.

## 7. Architecture logicielle

```
src/sim/               noyau pur, sans DOM, testable
  lif.ts               état des neurones + un tick d'activité
  topology.ts          construction CSR bidirectionnelle, régions, connectivité spatiale
  plasticity.ts        traces, règle à trois facteurs, homéostasie
  brain.ts             assemblage des régions, encodage capteurs, décodage moteur
  world.ts             arène, nourriture, toxine, prédateur, énergie, mort
  organism.ts          la boucle fermée : sentir → cerveau → décider → agir → doper
  metrics.ts           durées de vie, statistiques comportementales, taux
  protocols.ts         apprentissage / gelé / yoked / lésion
src/worker/sim.worker.ts   boucle temps réel, ping-pong de buffers transférables
src/components/vie/        interface : cerveau 3D, monde 2D, décision, preuves
src/app/page.tsx           la nouvelle expérience principale
src/app/theorie/           inchangé (archive)
```

Chaque module de `src/sim/` est pur et déterministe pour une graine donnée : c'est ce qui rend
les preuves rejouables. Le worker est la seule frontière avec le temps réel.

### Frontière worker → rendu

Le worker possède l'état. Il envoie par image, par `postMessage` avec transfert de propriété
(zéro copie), un jeu de buffers ping-pong :

- `activity` `Float32Array[N]` — niveau lumineux par neurone (décharge = 1, décroissance
  exponentielle) ;
- un enregistrement compact : état du monde, accumulateurs moteurs, dopamine, statistiques.

Les positions 3D et les couleurs de région ne sont envoyées qu'une fois, à l'initialisation.
On évite délibérément `SharedArrayBuffer` : il imposerait les en-têtes COOP/COEP à toute
l'application pour un gain nul à ce volume (200 Ko/image).

### Rendu

- **Cerveau** : `three.js` `Points`, 50 000 sommets, shader personnalisé — couleur de base par
  région, blanchiment proportionnel à l'activité, taille modulée. Mélange additif, profondeur
  désactivée. Un sous-échantillon d'arêtes (≈ 80 000, les plus fortes) en `LineSegments`,
  rafraîchi lentement, sur bascule.
- **Monde** : canvas 2D. Netteté et lisibilité prioritaires sur l'effet.
- **Décision** : quatre barres d'accumulation, seuil marqué, éclat au franchissement.

## 8. Découpage

- **Lot 1 — Noyau vivant.** `src/sim/` complet + preuve headless que l'organisme apprend.
  C'est le lot qui décide si le projet tient. Rien d'autre ne commence avant qu'il passe.
- **Lot 2 — Worker et rendu.** La simulation devient visible et interactive à 50 000 neurones.
- **Lot 3 — Preuves.** Les quatre protocoles, en test et dans l'interface.
- **Lot 4 — Mise en scène.** Régions nommées, vague de dopamine, chronologie des vies,
  narration d'accueil. Contrôle final à l'œil dans le navigateur.

## 9. Risques identifiés

| Risque | Traitement |
|---|---|
| Le réseau ne converge pas (crise ou extinction) | Homéostasie + seuil adaptatif dès le lot 1 ; calibration du régime *avant* de brancher la récompense, avec un test qui borne le taux de décharge moyen |
| Le balayage dopamine domine le budget CPU | Déversement toutes les 16 ticks ; repli documenté sur un registre d'arêtes touchées si la mesure l'exige |
| L'apprentissage est trop lent pour être vu | Découplage de la vitesse de simulation et de l'affichage (le worker peut tourner à plusieurs centaines de ticks/s) + accélérateur d'apprentissage explicite dans l'interface |
| « Wow » visuel qui masque un comportement creux | Le lot 3 est non négociable et la lésion est la preuve maîtresse |
