# Lot 1 « voie olfactive » — mesures de la porte (2026-07-31)

Sonde : `src/sim/voie.probe.test.ts` — `runProtocole` sur 16 sujets × 4 conditions,
n = 1 200 neurones (≈ 1 030 cellules de Kenyon), dt = 1 ms, enveloppe publiée
(mise en place 2 000, CS 4 000, ISI 3 000, US 3 000, après 2 000, ITI = 4·tauElig +
2 000 = 12 000 ticks). Le plan intra-sujet rejoue le même câblage dans chaque
condition — impossible sur l'animal, légitime ici.

## La porte

| Condition | Courbe mesurée (répondants/essai) | Verdict |
|---|---|---|
| apparié | 0 % → 100 % → 100 % → 100 % → 100 % | acquisition |
| non apparié | 0 % → 0 % → 0 % → 0 % → 0 % | plat ✓ |
| inversé (US avant CS) | 0 % → 0 % → 0 % → 0 % → 0 % | plat ✓ |
| gelé (lr = 0) | 0 % partout, **0 synapse déplacée** | immobile ✓ |

- **Fisher exact à l'essai 5 : 16/16 vs 0/16 → p = 1,66·10⁻⁹ ≪ 0,01.** Porte PASSÉE.
- Contrôle UR intégré : 16/16 sujets montrent le réflexe inconditionnel
  (gustatif → sortie, câblé inné), aucun exclu.
- ~1 020 / ~1 030 arêtes plastiques bougent dans les trois conditions actives — le
  mouvement synaptique existe partout ; seul l'apparié le convertit en réponse.
- Coût mesuré : 8,7 M ticks, ≈ 9 min à n = 1 200.

## Deux défauts trouvés et corrigés en route

1. **La fenêtre de crédit était plafonnée par `dumpEvery`, pas par `tauElig`.**
   `addDopamine` remettait `elig[e] = 0` à CHAQUE déversement cadencé, même à dopamine
   nulle — l'éligibilité mourait tous les 250 ticks au lieu de décroître sur 2 500.
   Correction : seule une consolidation réelle (d ≠ 0) consomme la marque
   (`plasticity.ts`, `consomme`). Sans elle, seules les coïncidences des ~250 derniers
   ticks du CS survivaient jusqu'à l'US.
2. **La sensibilisation non appariée est réelle.** L'US seul fait répondre le MBON ;
   ses décharges créditent les arêtes dont la KC vient de décharger spontanément →
   dérive lente (+10 à +60 décharges sur le protocole, contre +430 pour l'apparié).
   Chez l'animal aussi le témoin non apparié sensibilise — mais le contraste exige
   qu'une réponse conditionnée en soit nettement au-dessus : `margeSeuil = 1,4`
   (paramètre de la règle de décision, déclaré).

## Paramètres ajustés déclarés (budget ≤ 2)

- `lr` (exploré : 0,02 / 0,05 / 0,15 — le résultat est robuste ; retenu 0,05, la valeur
  du noyau, donc non ajustée en fait) ;
- `margeSeuil = 1,4` — la règle de décision (seuil = quantile naïf × marge).

Non ajustés : seuil (déduit du taux spontané cible par sujet), gain APL (fixé par la
cible de sparsité publiée ≈ 4–7 % → mesuré 3,5 % à gain 20), w0 (fixé pour que la
sortie naïve ne sature pas — à 0,05 le contrôle UR devenait indiscernable).

## Écarts assumés et limites

- La courbe de groupe sature dès l'essai 2 (100 %), plus vite que la référence
  (≈ 80 % à l'essai 3). L'apprentissage en UN essai existe chez l'animal ; notre
  lecture binaire à seuil unique n'a pas la résolution pour montrer la gradation
  individuelle — comptes bruts : 317 → 535 → 646 → 749 à lr = 0,02 (montée réelle,
  mais le seuil est franchi tôt).
- La sensibilisation persiste sous la marge : le témoin non apparié montre une dérive
  réelle des poids (~1 020 synapses bougent) — plate en réponse parce que la règle de
  décision exige +40 % au-dessus du naïf. Honnête, mais à surveiller si un protocole
  plus long la fait franchir.
- Effectifs réduits (n = 1 200, 40 glomérules vs ~160 publiés, 16 sujets vs 40) —
  même code, la version publiée est NSUJETS=40.
- Le mot « abeille » n'apparaît nulle part dans le code (règle tenue).

## Épistémologie

Comportement **acquis** démontré pour la première fois dans le projet : la réponse au
CS n'existe qu'après l'appariement CS→US, disparaît si l'US précède le CS ou si les
deux ne co-occurent jamais, et n'existe pas sans plasticité (lr = 0). C'est le sens
fort de « émergent » que le lot 1 « vie » n'avait pas atteint : la contingence
temporelle est lue par la fenêtre de crédit, pas par un raccourci.

---

# Rang 2 « généralisation » — mesures de la porte (2026-07-31)

Sonde : `src/sim/voie-generalisation.probe.test.ts` — après 5 essais appariés sur
l'odeur A, on teste des déclinaisons à distance croissante dans l'encodeur (ordre des
tests aléatoire par sujet).

## La calibration de l'encodeur (mesures de chemin)

1. **Le premier régime était dense, pas épars.** La métrique « 3,5 % de décharge KC »
   mesurait un TAUX instantané — mais la sparsité publiée est une sparsité de
   POPULATION (fraction des KC qui répondent à une odeur). Mesuré : ~35 % des KC
   déchargeaient ≥100 fois sous le CS → l'apprentissage potentialisait presque tout
   → généralisation totale (odeur disjointe : 84 % de la réponse).
2. Le compte de KC répondantes a un **plancher structural** : à 10 afférences/KC et
   12 glomérules actifs (densité 0,3 sur 40), ~5 afférences actives suffisent → 11,5 %
   quel que soit le gain APL (l'APL borne le taux, pas le compte).
3. Régime retenu : **nGlom = 160 (compte publié), pnParGlom = 2, densité 0,2,
   wGK = 0,05, gainAPL = 30, injectOdeur = 0,6** → 2,5 % de KC répondantes (un peu
   sous la bande 4–7 % publiée), MBON naïf ~16/4 000 t, plancher de généralisation
   ~6–17 %.
4. Bonus : la courbe d'acquisition devient graduée à ce régime (56 → 145 → 221 →
   283 → 320 sur 5 essais) — plus proche de la forme publiée que la saturation en un
   essai du premier régime.

## Le gradient mesuré (32 sujets, tests en ordre aléatoire)

| distance (glom. remplacés /32) | répondants | compte moyen |
|---|---|---|
| 0 (odeur conditionnée) | 100 % | 214 |
| 28 (= 1C calibré) | 72 % | 42 |
| 30 (= 2C calibré) | 53 % | 35 |
| 31 (= 3C calibré) | 25 % | 30 |
| 32 (disjointe) | 13 % | 26 |

- Monotone strict sur les points calibrés : 72 > 53 > 25 ✓
- **Ratio r(1C)/r(3C) = 2,88 ∈ [1,7 ; 2,9]** — passé, juste sous la borne haute.
- Gelé (lr = 0, 12 sujets) : 0–6 % à toutes les distances ✓
- Publié 53/31/23 vs mesuré 72/53/25 : la FORME est bonne, les niveaux ~+19/+22/+2 pts
  — notre réponse conditionnée sature à 100 % (publié ~80 %), le gradient est décalé
  vers le haut. Écart assumé, documenté dans `CARBONE_REMPLACES`.
- La porte du lot 1 re-passe au nouveau régime (Fisher 1,66·10⁻⁹, témoins plats).

## Ce que ça démontre

Le réseau n'apprend pas « répondre » — il apprend **« cette odeur-là »** : la réponse
est une fonction décroissante monotone de la similarité à l'odeur renforcée. La
mémoire écrite dans les synapses encode une métrique de l'espace des odeurs — une
propriété de l'environnement, pas des stimuli.

---

# Rang 4 « discrimination A+/B− » — mesures de la porte (2026-08-01)

Sonde : `src/sim/voie-discrimination.probe.test.ts` — 5 essais CS+ appariés
entrelacés avec 5 essais CS− jamais renforcés (publié : Mota & Giurfa 2010,
n = 111). Contrebalancement : moitié des sujets A+/B−, moitié B+/A−.

## Choix de distance CS+/CS− (sonde jetable, 16–24 sujets)

| distance | CS− à l'essai 5 | verdict |
|---|---|---|
| 16/32 | 100 % | indiscernable — généralisation totale |
| 24/32 | 100 % | trop proche : les KC partagées potentialisées à chaque essai CS+ portent le CS− |
| 28/32 | 79 % | McNemar 5 vs 0, p = 3e-2 — marginal |
| 30/32 | 38 % | **retenu** — discrimination nette + non-discriminateurs au taux publié |
| 32/32 | 25 % | propre mais quasi trivial |

Le CS− ne redescend pas par un mécanisme d'inhibition : il monte parce que les KC
partagées entre les deux codes sont potentialisées à chaque essai CS+ (la
généralisation du rang 2, vue en dynamique). La discrimination vient de ce qu'il en
reste peu à distance 30 (~2 glomérules partagés) — l'affûtage, chez l'animal, repose
aussi sur une inhibition associative du CS−, non modélisée ici.

## Le gradient mesuré (32 sujets, distance 30)

| essai | CS+ | CS− |
|---|---|---|
| 1 | 0 % | 0 % |
| 2 | 100 % | 13 % |
| 3 | 100 % | 16 % |
| 4 | 100 % | 41 % |
| 5 | 100 % | 38 % |

- McNemar sur les discordants du dernier essai : **20 vs 0, p = 9,54·10⁻⁷** ≪ 0,01.
- Contrebalancement : groupe A+ → 11 vs 0 ; groupe B+ → 9 vs 0 — la discrimination
  suit la contingence, pas l'odeur.
- **37,5 % de sujets (12/32) répondent encore au CS− à l'essai 5** — publié : 31,5 %
  échouent la discrimination initiale. La porte exige l'effet de groupe, pas
  l'unanimité : tenu.
- Gelé (lr = 0, 12 sujets) : CS+ 0/12, CS− 1/12 — plat.

## Ce que ça démontre

La différence de réponse entre les deux odeurs n'est ni dans le câblage ni dans les
odeurs (contrebalancées) — elle est **écrite par la contingence** : seule l'odeur qui
a précédé le sucrose porte la mémoire. Avec le rang 2, c'est la deuxième preuve que
le schéma synaptique émergent encode une propriété du monde : une frontière de
décision entre « annonce la récompense » et « ne l'annonce pas ».
