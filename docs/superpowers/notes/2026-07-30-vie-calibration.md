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

### Question ouverte à vérifier au lot 2

L'équilibre excitation/inhibition repose désormais surtout sur l'**amplitude** des poids
(`wInh` = 15 × `wExc`) et non sur le profil spatial « mexican hat » (`sigmaInh` = 2 ×
`sigmaExc`). La conception annonçait des ondes voyageuses et des avalanches obtenues
« gratuitement » par ce profil ; un équilibre dominé par l'amplitude pourrait ne pas les
produire. À constater à l'œil au lot 2 — et à corriger alors en rééquilibrant vers le profil
spatial, pas à supposer acquis.
