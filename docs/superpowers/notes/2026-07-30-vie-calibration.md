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
