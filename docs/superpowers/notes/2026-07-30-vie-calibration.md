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
