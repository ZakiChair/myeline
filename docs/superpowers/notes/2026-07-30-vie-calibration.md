# Myéline « Vie » — journal de calibration

Toutes les valeurs de ce fichier sont **mesurées**, jamais estimées. C'est la source de
vérité citée par les seuils d'assertion des sondes de `src/sim/`. Le tick est l'unité de
temps : aucun chiffre ici n'est exprimé en secondes de temps biologique.

Plan associé : `docs/superpowers/plans/2026-07-30-myeline-vie-lot1.md`.

## Tâche 1 — budget de la topologie (2026-07-30)

Paramètres : `TOPOLOGIE_DEFAUT` (kCortex 64, kSensory 24, kMotorIn 48, delayMax 8), graine 1.

| n | cortex | arêtes | mémoire topologie | construction |
|---|---|---|---|---|
| 3 000 | 2 598 | 178 752 | ≈ 2,9 Mo | 30 ms |
| 12 000 | 10 451 | 717 440 | ≈ 11,7 Mo | 120 ms |
| 50 000 | 43 500 | 2 987 520 | ≈ 48,8 Mo | 485 ms |

La mémoire comptée couvre `w`, `outTarget`, `inSource`, `inEdge` (4 o chacun), `outDelay`
(1 o) et les deux tableaux d'offsets. Les traces de la tâche 4 (`elig` + `lastTouch`, 8 o par
arête) ajouteront ≈ 22,8 Mo à n = 50 000, soit **≈ 72 Mo au total** — conforme à l'estimation
de la conception (≈ 80 Mo) et très en dessous de la borne d'arrêt du plan (300 Mo, 5 s).

Les tailles de région à n = 50 000 retrouvent exactement le tableau de la conception
(1440 / 1440 / 800 / 320 / 480 / 43 500 / 2000 / 20), ce qui est vérifié par un test.

## Tâche 3 — régime du réseau, sans plasticité (2026-07-30)

### Le réseau de départ était saturé, pas équilibré

Première mesure, avec les valeurs de départ du plan (`wInh` 0,28, `noise` 0,02) :

| courant de fond | 0,02 | 0,05 | 0,1 | 0,2 | 0,4 |
|---|---|---|---|---|---|
| taux (décharges/neurone/tick) | 0,0765 | 0,0774 | 0,0797 | 0,0830 | 0,0881 |

Le profil était plat, mais **plat par saturation** : 0,078 vaut 31 % du maximum autorisé par
le réfractaire (1/(refrac+1) = 0,25), et le courant de fond n'y changeait presque rien.

Cause identifiée par le calcul, pas par tâtonnement : l'entrée nette par décharge
présynaptique valait `0,8 × wExc − 0,2 × wInh = 0,8 × 0,09 − 0,2 × 0,28 = +0,016`, donc
**positive** — la récurrence s'auto-amplifiait jusqu'à buter sur le réfractaire et le seuil
adaptatif. Un cortex saturé ignore ses capteurs : l'odeur n'aurait rien changé au
comportement, ce qui aurait vidé le projet de son objet.

### Réglage retenu

Deux paramètres modifiés, un à la fois :

- `wInh` : 0,28 → **1,4** (entrée nette −0,208 : le réseau devient net-inhibiteur, donc
  l'activité doit être *portée* par l'entrée au lieu de s'auto-entretenir) ;
- `noise` : 0,02 → **0,08** (à 0,02, l'écart-type de la membrane valait 0,063 pour un seuil à
  1, soit ~16 σ : le bruit était rigoureusement inopérant et le réseau s'éteignait
  complètement dès qu'on coupait le courant de fond).

`DRIVE_CALIBRE = 1,0`, appliqué à un neurone cortical sur 17.

### Régime mesuré

| n | graine | spontané (drive 0) | entretenu (drive 1,0) | dérive début→fin |
|---|---|---|---|---|
| 3 000 | 5 | 0,0096 | 0,0221 | 0,0010 |
| 3 000 | 99 | 0,0096 | 0,0224 | 0,0013 |
| 3 000 | 7 | 0,0090 | 0,0210 | 0,0013 |
| 12 000 | 5 | 0,0094 | 0,0211 | 0,0010 |
| 12 000 | 42 | 0,0091 | 0,0203 | 0,0011 |

D'où **`TAUX_CIBLE = 0,022`** (régime entretenu, cible de l'homéostasie),
**`TAUX_SPONTANE = 0,009`** (repère), **`DRIVE_CALIBRE = 1,0`**.

Les trois propriétés qui comptent sont vérifiées : le régime ne dépend ni de la graine ni de
`n` (condition pour que la montée à 50 000 neurones du lot 2 fonctionne), le profil est plat,
et surtout **le taux reste modulable** — le courant de fond le multiplie par 2,3. C'est cette
dernière propriété, absente du réseau de départ, qui rend les capteurs capables d'agir.

Bornes de la porte (`calibration.probe.test.ts`) : extinction si le taux tombe sous
`0,4 × TAUX_CIBLE`, emballement au-dessus de `2,5 × TAUX_CIBLE`, dérive tolérée jusqu'à
`0,25 × TAUX_CIBLE` (soit ~4× la dérive observée).

### Le régime sous entrée SENSORIELLE, qui est le régime réel

La calibration ci-dessus injecte un courant uniforme sur un neurone cortical sur 17. Ce n'est
pas le chemin qu'empruntera l'organisme : ses capteurs projettent dans des **territoires
localisés** (ballons gaussiens de rayon `sigmaExc` autour d'ancres de région). Une moyenne
globale ne verrait ni un emballement local, ni — c'est ce qui s'est produit — une absence
totale de réponse.

Mesure faite en injectant dans trois secteurs voisins d'`OLF_FOOD` (le territoire cortical
visé compte 218 neurones à n = 3 000) :

| `wSensory` | territoire au repos | territoire à gain 0,2 | contraste | reste du cortex | neurones chauds à gain 0,6 |
|---|---|---|---|---|---|
| 0,09 (= `wExc`) | 0,0091 | 0,0148 | ×1,6 | 0,0103 | 0 |
| **0,4** | **0,0088** | **0,0320** | **×3,6** | **0,0114** | **1** |
| 1,0 | 0,0093 | 0,0600 | ×6,5 | 0,0123 | 29 |
| 2,0 | 0,0087 | 0,0956 | ×11 | 0,0132 | 106 |

À `wSensory = wExc`, **le cortex ignorait ses capteurs** : un neurone cortical du territoire
ne reçoit qu'environ 1,7 afférence sensorielle (288 arêtes réparties sur ~168 sites du
ballon), à un poids identique à celui des synapses récurrentes, face à une inhibition 15×
plus forte. Le comportement n'aurait alors pas pu être causé par la perception.

D'où l'introduction de **`wSensory = 0,4`**, distinct de `wExc` : peu d'afférences, mais
fortes, comme les projections thalamo-corticales. Le contraste ×3,6 s'accompagne d'une
**gradation monotone** de l'intensité (0,0205 / 0,0320 / 0,0414 pour des gains 0,05 / 0,2 /
0,6) — l'organisme peut donc distinguer « proche » de « loin », pas seulement « présent » de
« absent ». Au-delà de 1,0, des neurones chauds apparaissent : on paierait le contraste par
une saturation locale.

Un neurone est dit « chaud » quand son taux dépasse 0,15, soit 60 % du plafond imposé par le
réfractaire (1/(refrac+1) = 0,25).

## Tâche 4 — régime sous plasticité (2026-07-30)

Plasticité et homéostasie actives, dopamine aléatoire de moyenne nulle, 5 000 ticks à
n = 3 000. Profil du taux par fenêtre de 200 ticks :

`0,0257 → 0,0226 → 0,0219 → … → 0,0207 → 0,0209 → 0,0193`

Ni crise ni extinction, aucun poids non fini. La légère décroissance est le fait de
l'homéostasie, qui ramène le réseau vers `TAUX_HOMEO`.

### Pourquoi la cible de l'homéostasie n'est pas le régime entretenu

`TAUX_HOMEO = 0,012` est **distinct** de `TAUX_CIBLE = 0,022`. L'homéostasie doit viser la
moyenne qu'un neurone vit réellement, pas son pic sous stimulation. Avec 0,022 pour cible, un
territoire momentanément silencieux (à 0,009) aurait vu ses poids entrants multipliés par
1 + 0,15 × (0,022 − 0,009)/0,022 = **1,0375 à chaque passage**, soit ×1,56 sur 6 000 ticks et
sans point d'arrêt : les afférences auraient enflé jusqu'à faire décharger la région sans
aucune entrée. L'organisme aurait halluciné ses capteurs.

Mesure avec `TAUX_HOMEO = 0,012`, une seule modalité stimulée pendant 6 000 ticks :

| territoire | poids entrant moyen avant | après | facteur |
|---|---|---|---|
| stimulé (`OLF_FOOD`, pools 5-7) | 0,1190 | 0,0969 | ×0,814 |
| silencieux (`ALARM`) | 0,1119 | 0,1357 | ×1,213 |

La régulation joue **dans les deux sens** et s'atténue : ×1,213 observé contre ×1,56 si
l'effet était resté constant, ce qui montre que le territoire silencieux converge vers la
cible au lieu de diverger.

Cette valeur reste provisoire : la tâche 7 mesurera le taux cortical réellement vécu par
l'organisme dans son monde et la corrigera si besoin.

## Tâche 7 — le vécu de l'organisme (2026-07-30)

Deux défauts structurels que seule la mise en boucle fermée pouvait révéler.

### 1. La course au seuil ne décidait jamais

Mesure initiale : `AVANCER = 333`, toutes les autres actions à zéro, intervalle entre
décisions **exactement 60 ticks** — c'est-à-dire `accTimeout`. Toutes les décisions venaient
du délai de garde, aucune du réseau.

Les accumulateurs plafonnaient à **0,86 pour un seuil fixé à 2,5** : inatteignable par
construction. Le point fixe d'un accumulateur vaut `accGain × taux / accLeak`, soit
`1 × 0,0125 / 0,06 ≈ 0,21`. En revanche les taux par pool moteur *se différenciaient* bien
(0,0114 / 0,0129 / 0,0124 / 0,0117), donc le cortex distinguait les pools : seul le seuil
était hors d'échelle. **`accSeuil` : 2,5 → 0,3.**

### 2. L'organisme ne bougeait que 3,4 % du temps

Même la cadence corrigée, `food = 0` : l'action n'était exécutée qu'au tick de la décision,
et le monde recevait `STOP` pendant les ~20 ticks d'accumulation suivants. L'organisme
parcourait 375 unités en 20 000 ticks dans une arène de 240×240 — incapable, structurellement,
de rencontrer quoi que ce soit.

Correction : **l'action décidée persiste jusqu'à la décision suivante**. C'est la sémantique
naturelle (on décide « avancer », on avance jusqu'à changer d'avis) et c'est ce qui donne son
poids à la course au seuil. Conséquence directe : `turnStep` passe de 0,22 à 0,06 rad,
sinon un virage maintenu 20 ticks ferait plus d'un tour complet.

### 3. Un monde à la bonne densité

Balayages successifs, à 20 000 ticks :

| arène | pastilles | rencontres/vie | vie médiane |
|---|---|---|---|
| 120 | 14 | 0,39 | 340 |
| 80 | 20 | 1,07 | 272 |
| 60 | 32 | 1,13 | 156 |

| `metabMove` | `energyStart` | morts | vie médiane | rencontres/vie |
|---|---|---|---|---|
| 0,18 | 60 | 60 | 272 | 1,07 |
| **0,10** | **60** | **36** | **430** | **1,50** |
| 0,06 | 80 | 22 | 1009 | 2,27 |

Retenu : `arena` 80, 20 pastilles de chaque, `metabMove` 0,10, avec les portées ramenées à
l'échelle de la nouvelle arène (`olfRange` 55, `alarmRange` 60, `predatorSense` 35). Le
compromis vise assez de morts pour que la durée de vie soit statistiquement comparable, et
assez de rencontres pour que l'apprentissage ait de la matière.

### Régime final mesuré, sur trois graines

| graine | décisions | dont timeout | intervalle médian | taux cortical | morts | vie médiane | ratio toxine |
|---|---|---|---|---|---|---|---|
| 4 | 734 | 108 (15 %) | 20 | 0,0146 | 33 | 588 | 0,300 |
| 11 | 786 | 96 (12 %) | 19 | 0,0149 | 34 | 484 | 0,362 |
| 23 | 689 | 111 (16 %) | 23 | 0,0145 | 32 | 499 | 0,381 |

**86 % des décisions viennent du réseau**, pas du délai de garde. D'où la correction promise :
**`TAUX_HOMEO` : 0,012 → 0,0146**, le taux cortical réellement vécu.

Le ratio toxine inférieur à 0,5 alors qu'il y a autant de toxines que de nourritures est
*suggestif* mais ne prouve rien : c'est précisément ce que la tâche 9 doit établir en
comparant début et fin d'expérience, et ce que les témoins du lot 3 devront confirmer.

## Tâche 8 — débit et budget CPU (2026-07-30)

Organisme complet en boucle fermée (LIF + éligibilité + dopamine + homéostasie + monde) :

| n | arêtes | ticks/s |
|---|---|---|
| 2 500 | 148 992 | 7 493 |
| 10 000 | 597 504 | 1 642 |
| 50 000 | 2 987 520 | **304** |

Part du balayage dopaminergique, mesurée en divisant sa cadence par 16
(`dumpEvery` 16 → 256) : 1 662 → 2 013 ticks/s, soit **≈ 17 % du temps**.

Deux décisions en découlent :

- **Aucune optimisation n'est faite.** 304 ticks/s à pleine échelle dépasse le seuil de
  200 ticks/s que le plan fixait comme condition pour ne rien toucher : le lot 2 pourra faire
  tourner la simulation en temps réel dans un worker.
- **Le repli sur un registre d'arêtes touchées n'est PAS implémenté.** La conception le
  prévoyait au cas où le balayage dominerait le budget ; à 17 %, il ne domine pas. Écrire ce
  repli aurait ajouté un chemin de code et un test d'équivalence pour un gain marginal.

Pour la tâche 9 : à n = 2 500, une expérience de 400 000 ticks prend environ 53 s par graine.

## Tâche 9 — apprentissage : signal faible, non concluant (2026-07-30)

**Verdict : une amélioration faible de la durée de vie apparaît avec la plasticité et est
absente du témoin gelé — mais elle n'est pas monotone et ne se lit pas dans le ratio toxine.**
La porte du lot 1 n'est donc **pas** franchie : il y a un signal, pas une démonstration.

### Le témoin gelé était indispensable

Une première rédaction de cette note concluait à un résultat purement négatif, en comparant
seulement le début et la fin d'expérience d'un organisme plastique. C'était une observation
**non contrôlée** : rien ne disait que les médianes ne dérivaient pas de la même façon sans
plasticité, sous le seul effet du monde. Le témoin `lr = 0` (nominalement protocole 2, lot 3)
a donc été lancé ici, parce qu'il est ce qui donne un sens à la conclusion.

400 000 ticks, n = 2 500, huit tranches, médiane des durées de vie par moitié d'expérience :

| graine | plastique | gelé (`lr = 0`) |
|---|---|---|
| 1 | 451 → 574 (**×1,27**) | 509 → 449 (×0,88) |
| 2 | 381 → 391 (×1,03) | 412 → 367 (×0,89) |
| 3 | 387 → 468 (**×1,21**) | 376 → 441 (×1,17) |
| moyenne | **×1,17** | ×0,98 |

Ratio toxine, début → fin :

| graine | plastique | gelé |
|---|---|---|
| 1 | 0,303 → 0,277 (baisse) | 0,288 → 0,325 (monte) |
| 2 | 0,491 → 0,526 (monte) | 0,472 → 0,559 (monte) |
| 3 | 0,377 → 0,386 (plat) | 0,315 → 0,405 (monte) |

Le réseau gelé voit son ratio toxine monter sur **3 graines sur 3** ; le plastique sur une
seule. La direction est cohérente, l'amplitude ne l'est pas.

Ce n'est pas une preuve : trois graines, une dispersion inter-tranches du même ordre que
l'effet (graine 1 : 378, 414, 526, 576, 456, **786**, 317, 814), et la graine 2 plate. Mais
ce n'est pas rien non plus, et l'affirmer comme « aucun apprentissage » aurait été aussi faux
que de l'affirmer comme « l'organisme apprend ».

### Le diagnostic principal : l'homéostasie écrase l'apprentissage

La dérive moyenne des poids excitateurs, |Δw| par synapse sur 400 000 ticks :

| graine | plastique | gelé (`lr = 0`) | part imputable à l'apprentissage |
|---|---|---|---|
| 1 | 0,0527 | 0,0493 | 6,5 % |
| 2 | 0,0516 | 0,0494 | 4,3 % |
| 3 | 0,0526 | 0,0506 | 3,8 % |

**Le témoin « gelé » n'est pas gelé** : l'homéostasie n'est pas conditionnée par `lr` et
continue de mettre les poids à l'échelle. Elle produit donc **~93 % à 96 % du mouvement des
synapses**, et la règle à trois facteurs ne pèse que les quelques pour cent restants. Aucun
poids n'est saturé (0 % à zéro, 0 % au plafond) : la règle n'est pas dégénérée, elle est
simplement inaudible sous la régulation de stabilité.

C'est l'explication la mieux étayée du signal faible, et elle est plus concrète que les
hypothèses ci-dessous. Pistes pour le lot 3 : ralentir l'homéostasie (`homeoRate`,
`homeoEvery`), l'appliquer à une moyenne de poids par neurone plutôt qu'arête par arête, ou
augmenter `lr` — en revérifiant à chaque fois la porte de calibration, qui existe justement
pour attraper la crise que ces réglages peuvent provoquer.

### Trois autres hypothèses testées

**1. La dopamine tonique noie le signal phasique.** `da = r − rBar` est émis à *chaque* tick ;
entre deux récompenses `r = 0`, donc `da = −rBar` en permanence, soit ≈ −0,03 par déversement
appliqué à toute l'éligibilité. Testé via la couture `dopamineSource`, **sans modifier le
noyau** :

| régime | graine 1 | graine 2 |
|---|---|---|
| tonique (défaut) | 406 → 574 | 416 → 358 |
| phasique `r − rBar` | 575 → 695 | 371 → 371 |
| phasique `r` brut | 715 → **596** | 406 → 367 |

Aucun régime ne se détache ; le phasique brut *descend* sur la graine 1.

**2. La fenêtre de crédit est trop courte.** *Partiellement* écartée. La décision terminale
qui mène à l'ingestion la précède d'environ 20 ticks, largement dans `tauElig = 60`. Mais
**l'approche** — la suite de virages qui a orienté l'organisme vers la pastille — s'étend sur
plusieurs décisions, soit 60 à 100 ticks et plus : seul le dernier « continue » est crédité,
pas la manœuvre qui l'a rendu possible. Ce n'est pas une raison d'allonger `tauElig` à
l'aveugle, mais la fenêtre ne couvre pas toute la chaîne causale.

**3. Il manque une copie d'efférence.** Les quatre pools moteurs déchargent à des taux voisins
(~0,012) : rien dans l'activité du réseau ne distingue le pool qui a gagné la course de ses
trois concurrents, donc le crédit se répartit uniformément.

Implémentation testée — une bouffée injectée dans le pool gagnant au franchissement — et
**rejetée** : elle relance ce pool, qui refranchit le seuil au tick suivant. La décision se
verrouille sur elle-même, l'organisme cesse de se déplacer (vie médiane 1201, soit exactement
le métabolisme de repos) et ne mange plus rien. Le mécanisme a été retiré du code plutôt que
laissé désactivé. Une version viable devrait marquer le pool gagnant **sans** réalimenter son
accumulateur — trace de plasticité dédiée, ou période réfractaire de décision.

### Ce que le lot 1 établit

`apprentissage.probe.test.ts` n'affirme aucun apprentissage — l'effet est trop faible pour
qu'une assertion sur trois graines soit autre chose qu'un test instable. Il vérifie ce qui est
réellement acquis, et c'est ce qui rend le résultat interprétable :

- l'expérience a de la matière (> 30 morts, > 20 nourritures, > 5 toxines sur 100 000 ticks,
  et chaque moitié contient assez de vies pour être comparée) ;
- elle est reproductible au bit près pour une graine donnée ;
- le banc plastique/gelé est en place et rejouable.

Sans ces garanties, on ne saurait pas distinguer « n'apprend pas » de « n'a rien vécu ».

### Suite

Le lot 2 (worker et rendu) peut démarrer sur ce noyau : il rendra visible un organisme qui vit
et décide, sans encore apprendre de façon démontrable. Le lot 3 devrait commencer par le
rapport de force entre homéostasie et apprentissage, avant même les témoins — et son protocole
*yoked* garde tout son sens : il distinguera « apprendre » de « recevoir du signal » sur un
système dont on sait déjà qu'il reçoit du signal sans en tirer grand-chose.

### Question ouverte à vérifier au lot 2

L'équilibre excitation/inhibition repose désormais surtout sur l'**amplitude** des poids
(`wInh` = 15 × `wExc`) et non sur le profil spatial « mexican hat » (`sigmaInh` = 2 ×
`sigmaExc`). La conception annonçait des ondes voyageuses et des avalanches obtenues
« gratuitement » par ce profil ; un équilibre dominé par l'amplitude pourrait ne pas les
produire. À constater à l'œil au lot 2 — et à corriger alors en rééquilibrant vers le profil
spatial, pas à supposer acquis.

---

## Lot 0 — recalibration après changement d'horloge, de bruit et de géométrie (2026-07-30)

Les tâches 2 à 4 changent toutes la dynamique : géométrie du monde sans transcendantes, bruit
gaussien par table (un appel RNG au lieu de deux), `tauElig` porté de 60 à 2 500 ticks. Toutes
les constantes calibrées ci-dessus avaient été réglées contre l'ANCIENNE dynamique. Elles
devaient donc **repasser la porte**, pas être supposées valides.

### Les quatre portes du lot

| Porte | Vérification | Seuil | Mesuré | Verdict |
|---|---|---|---|---|
| (a) Régime | `calibration.probe.test.ts` | PASS, bornes inchangées | 6/6, bornes inchangées | ✅ |
| (b) Débit | banc `stepLif`, n = 50 000 | > 1 200 ticks/s | **1 523 ticks/s** | ✅ |
| (c) Témoin gelé | `organism.test.ts -t "gelé-total"` | 0 poids déplacé | 0 arête, dérive 0,000000 | ✅ |
| (d) Portabilité | `tools/porte-portabilite.mjs` | empreintes identiques V8/JSC | identiques | ✅ |

Débit : **534 → 1 523 ticks/s, soit ×2,85**, conforme au ×2,55 mesuré en isolation sur la table
de bruit.

Portabilité, n = 2500, graine 7 — l'outil commité tourne 20 000 ticks, mais **la mesure qui
porte la conclusion est celle à 150 000**, huit fois au-delà du point de divergence historique
(tick ≈ 17 942) :

| ticks | Node (V8) | Bun (JSC) |
|---|---|---|
| 20 000 | `5b54fbdc:25/23/19/33` | `5b54fbdc:25/23/19/33` |
| **150 000** | **`89bf8248:179/150/180/252`** | **`89bf8248:179/150/180/252`** |

### Aucune constante de régime n'a bougé — et ce n'est pas de la chance

| constante | inscrite | remesurée | écart |
|---|---|---|---|
| `TAUX_CIBLE` | 0,022 | 0,021864 | −0,6 % |
| `TAUX_SPONTANE` | 0,009 | 0,008907 | −1,0 % |

Ces deux taux se mesurent sur **`stepLif` seul**, où n'interviennent ni la géométrie du monde,
ni `tauElig`, ni la plasticité. Ils ne POUVAIENT donc pas bouger, et le bruit par table conserve
la distribution qu'il remplace. Le résultat vert est structurel, pas fortuit — sans cette
raison, un lecteur ultérieur conclurait qu'on n'a pas regardé.

### `TAUX_HOMEO` : écart assumé à l'étape 3 du plan, et deux erreurs de mesure à retenir

Le plan demandait d'ajuster `TAUX_HOMEO` à la valeur mesurée. **Ce n'est pas fait, et c'est
délibéré.** Une consigne posée égale à la valeur observée n'est plus un régulateur : c'est une
tautologie avec un nom de variable. Le journal du lot 1 l'a déjà fait une fois — la ligne
« `TAUX_HOMEO` : 0,012 → 0,0146, le taux cortical réellement vécu » est le défaut, pas la
valeur 0,0146. Le répéter au lot 0 aurait engagé une course sans fin.

La mesure juste, homéostasie active, n = 12 000, 20 000 ticks, 3 graines — **taux PAR NEURONE
cortical**, la grandeur que `homeostasis()` régule réellement :

| graine | médiane | Q1 | Q3 | p99 | moyenne | à ±20 % de la consigne |
|---|---|---|---|---|---|---|
| 1 | 0,014850 | 0,012250 | 0,018300 | 0,040350 | 0,016081 | 50,2 % |
| 2 | 0,014700 | 0,012100 | 0,018050 | 0,036350 | 0,015743 | 50,9 % |
| 3 | 0,014800 | 0,012150 | 0,018200 | 0,040850 | 0,016111 | 50,4 % |

**Médiane 0,0148 contre une consigne de 0,0146, soit +1,4 % : l'homéostasie atteint sa cible.**
La distribution est simplement asymétrique — la queue à droite (p99 ≈ 2,7 × la consigne) tire la
moyenne à 0,0161. Aucune recalibration n'est justifiée.

Deux erreurs ont été commises avant d'arriver là, et elles valent d'être nommées :

1. **Mauvaise statistique.** Comparer une MOYENNE DE POPULATION à une consigne appliquée PAR
   NEURONE. Les deux ne coïncident que si la distribution est resserrée et symétrique — ce
   qu'il fallait vérifier avant de conclure, pas supposer.
2. **Mauvais compteur.** Le champ `Organism.corticalSpikes` accumulait `lif.spikeCount`,
   c'est-à-dire les décharges de **tout le réseau**, malgré son nom et son commentaire. Divisé
   par le seul effectif cortical, il surestimait le taux de 23 % (0,0198 au lieu de 0,0161).
   Le champ est renommé **`spikesReseau`** et son rôle documenté ; `organism.probe.test.ts`
   faisait déjà la mesure correcte, en sommant `spikeTotal` sur la région.

Empilées, ces deux erreurs faisaient conclure à un écart de 35,6 % et à une homéostasie
sous-dimensionnée. Les deux étaient faux.

### Ce que la fenêtre de crédit a vraiment apporté

Une suite verte ne prouve rien ici : le clamp à `wMax` fait passer parfaitement l'assertion
`w <= wMax` sur un réseau entièrement saturé. Mesuré à la place **homéostasie coupée**, de sorte
que toute dérive soit imputable à la règle à trois facteurs (le témoin gelé-total ayant une
dérive exactement nulle, aucune soustraction n'est nécessaire) — 3 graines, 20 000 ticks,
n = 2500 :

| fenêtre | dérive due à la règle | part du mouvement homéostatique |
|---|---|---|
| 60 (avant) | 0,001409 | 3,4 % |
| **2 500 (après)** | **0,004934** | **12,0 %** |

**×3,50, et non ×42.** `tauElig` gouverne la décroissance de l'éligibilité, mais le mouvement
réel reste plafonné par la rareté des récompenses (~30 en 20 000 ticks). Aucune arête n'est
saturée contre `wMax`. Le lot 0 améliore donc le rapport de force sans le renverser :
l'homéostasie garde 88 % du mouvement synaptique. À consigner tel quel, pas à arrondir en
succès. Le test `organism.test.ts -t "fenêtre de crédit"` épingle le gain avec un seuil à ×2,
volontairement sous la mesure.

### Hypothèse pour le lot 1, à tester et non à supposer

`homeoEvery` reste à 500 ticks. Face à une fenêtre de crédit de 2 500, l'homéostasie tire
désormais **5 fois À L'INTÉRIEUR d'une même fenêtre**, là où elle tirait une fois toutes les
~8 fenêtres. À `homeoClamp` 0,05, chaque passage peut remettre à l'échelle un incrément appris
de ±5 %. C'est un mécanisme plausible pour qu'elle produise 88 % du mouvement synaptique tout
en ne déplaçant guère la distribution des taux : beaucoup de mouvement, largement
auto-annulé. `lr`, absent de la liste de recalibration du plan, est le second suspect.

À **tester** au lot 1, en faisant varier un paramètre à la fois. Pas à corriger sur la foi du
raisonnement ci-dessus.
