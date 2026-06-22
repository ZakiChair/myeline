# Myéline — Créature compagnon de marge sur /theorie

**Date :** 2026-06-22
**Statut :** design validé (brainstorming)
**Branche :** `feat/theorie-parcours` (ajout à la PR #1)

## 1. Intention

Ajouter, sur la page `/theorie`, une **petite créature issue du vrai modèle** (`reservoir-creature`) qui vit dans la marge et **te suit quand tu défiles** : elle tente de rejoindre ta position de lecture et apprend à le faire mieux au fil de la session. C'est une démonstration vivante et incarnée du modèle, fidèle à l'honnêteté du projet (vrai modèle, pas d'animation scriptée ; corps = scène codée).

## 2. Concept retenu

« Compagnon de marge qui te suit » : une **bande verticale fine fixe** sur le bord droit de la fenêtre, agissant comme un **rail de progression vivant** (sommet = début du document, bas = fin). La nourriture de la créature est épinglée à la position « tu es ici » (progression de défilement) ; la créature la poursuit via sa politique apprise.

## 3. Comportement

- Une vraie créature `makeReservoirCreature(seed, learn=true)` tourne en continu (`stepCreature`), boucle ~15 Hz.
- **Rodage non bloquant au montage** : poids à 0 ⇒ politique uniforme (marche aléatoire) ; on entraîne d'abord la créature (~3000 pas, en lots `setTimeout(0)`) à poursuivre une cible synthétique oscillante, pour qu'elle sache déjà « aller vers » la nourriture. Sans ce rodage, elle ignorerait ta position pendant des minutes. Elle **continue d'apprendre** ensuite en direct (`learn=true`).
- À **chaque tick**, avant `stepCreature`, on **épingle** `world.foodX = 0` (centre de la bande, léger jitter optionnel) et `world.foodY = (progress*2 − 1) * 90`, où `progress ∈ [0,1]` est la progression de défilement (même calcul que le rail : `scrollTop / (scrollHeight − clientHeight)`).
- La créature poursuit la cible ; quand elle l'atteint (`EAT_RADIUS`), `world.eaten++` et le modèle re-spawn une nourriture aléatoire — **immédiatement écrasée** au tick suivant par le ré-épinglage. Effet net : la nourriture est toujours à ta hauteur de lecture, et `eaten` compte les fois où elle t'a rejoint.
- `learn=true` : le fourrage s'améliore au fil de la session (elle te rattrape plus vite). Le shaping de récompense (`Math.sign(distBefore−distAfter)`) la pousse à se rapprocher de la cible.
- **Pause** quand l'onglet est caché (`document.visibilitychange`) — économie CPU.

## 4. Rendu

- Canvas dédié, **bande fixe** `position: fixed` bord droit, ~44 px de large, pleine hauteur, semi-transparent (ne domine pas la lecture).
- Mapping monde→pixels : `x ∈ [−100,100] → [pad, W−pad]` (étroit → faible amplitude horizontale), `y ∈ [−100,100] → [pad, H−pad]` (haut → poursuite verticale principale).
- Style réutilisé de `ReservoirCreatureView` : corps (ellipse) + tête + 4 pattes animées + halo + traînée + flash de récompense. Petit repère discret pour la cible (« tu es ici »).
- Couleurs du thème courant (`theme.canvas`).
- Visible **≥ lg** uniquement (masquée sur mobile, faute de place).
- Libellé discret au survol : « vrai modèle — elle apprend à te rejoindre ; le corps est de la scène codée ».

## 5. Architecture (isolation)

- **Nouveau** `src/components/theorie/MarginCompanion.tsx` — possède la créature (`makeReservoirCreature`), la boucle `setInterval`(step) + `requestAnimationFrame`(rendu), l'épinglage de la nourriture au scroll, la pause sur onglet caché, et le canvas vertical. Signature : `MarginCompanion({ theme }: { theme: ThemeCanvas })`.
- **Modifié** `src/app/theorie/page.tsx` — monte `<MarginCompanion theme={theme.canvas} />` une fois (dans le conteneur racine `data-theme`).
- **Aucune modification des moteurs.** On réutilise `makeReservoirCreature` / `stepCreature` (de `@/lib/reservoir-creature`) en surchargeant uniquement `world.foodX/foodY` depuis le composant. On NE réutilise PAS `useReservoirCreature` (qui spawn aléatoire et ne suit pas le scroll) ni `ReservoirCreatureView` (arène carrée) : le compagnon a son propre rendu vertical.

## 6. Vérification (critères de succès)

- `npx tsc --noEmit` + `npx eslint` (fichiers touchés) propres ; `npm run build` OK ; `npm test` reste 93/93 (aucune modif lib).
- **Revue visuelle navigateur** : la créature est visible dans la marge droite ≥ lg ; en défilant, la cible se déplace verticalement et la créature la poursuit ; `eaten` augmente quand elle te rejoint ; rendu cohérent sur les 4 thèmes ; console 0 erreur ; pas de fuite (RAF + interval annulés à l'unmount, pause sur onglet caché) ; masquée < lg.

## 7. Hors périmètre

- Pas de persistance de l'apprentissage entre visites : à chaque chargement, rodage rapide puis apprentissage en direct (pas de sauvegarde des poids d'une session à l'autre).
- Pas de modification de la logique du modèle ni des autres composants/démos.
- Pas d'interaction utilisateur (clic) sur la créature ; purement ambiante.
