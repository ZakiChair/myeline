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
