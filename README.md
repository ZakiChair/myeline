# Myéline

Un réseau de neurones impulsionnels est le cerveau d'un organisme qui doit rester en vie —
et, à terme, une voie olfactive d'apprentissage inspirée d'*Apis mellifera* à l'échelle
anatomique (~10⁶ neurones).

Le projet n'est pas une démo animée : chaque mécanisme est falsifiable, chaque chiffre
porte son statut (*mesuré / publié / calculé / inventé*), et les résultats négatifs sont
documentés, pas maquillés. La méthode — plus que le code — est l'actif principal.

## Démarrer

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 235 tests, dont des sondes de mesure (~3–4 min)
npm run build
npm run lint
node tools/porte-portabilite.mjs   # porte V8/JSC : état identique au bit près
```

## Carte du code

| Chemin | Contenu |
|---|---|
| `src/sim/` | **Noyau actif** — LIF à seuil adaptatif, topologie CSR bidirectionnelle, règle à trois facteurs (STDP × éligibilité × dopamine), monde (nourriture / toxine / prédateur), boucle fermée de l'organisme. Pur, déterministe, sans DOM. |
| `src/lib/` | **Archive** — les moteurs historiques (automate excitable, réservoir, créature) qui alimentent encore l'interface et documentent le « mur du crédit ». |
| `src/worker/` + `src/components/vie/` + `src/hooks/useOrganismSim.ts` | **Rendu du noyau (lot 2)** — worker temps réel, activité transférée en ping-pong de buffers, cerveau 3D (un point par neurone), monde 2D, course au seuil. |
| `src/components/` + `src/app/` | Interface Next.js : modes vie / studio / échelle / créature / organisme, et le parcours `/theorie`. |
| `docs/superpowers/` | Spécifications, plans de lots, **journal de calibration** — source de vérité des constantes mesurées. |
| `tools/` | Portes outillées (ex. portabilité inter-moteurs). |

## État du projet

Branche de travail : refonte « voie olfactive » (spec `2026-07-30-myeline-abeille-design.md`).

- **Fait** : noyau `src/sim/` complet (organisme en boucle fermée à 50 000 neurones,
  1 523 ticks/s), lot 0 passé — constantes en secondes, `dt` paramètre, portabilité
  bit-exacte V8/JSC, témoins gelé-apprentissage / gelé-total.
- **Fait aussi** : lot 2 « rendu » — le mode **Vie** de `/` montre l'organisme du
  nouveau noyau tourner dans un worker (50 000 neurones, cadence mesurée affichée,
  décisions visibles en direct). L'apprentissage n'y est toujours pas démontré —
  affiché comme tel.
- **Résultat négatif assumé** : le lot 1 « vie » n'a pas démontré d'apprentissage
  (l'homéostasie produisait 93–96 % du mouvement synaptique). Diagnostic et refonte dans
  les specs.
- **Fait** : lot 1 « voie olfactive » — **la porte est passée** (sonde
  `voie.probe.test.ts`) : glomérules → cellules de Kenyon → neurone de sortie + APL,
  plasticité confinée à la couche de sortie, harnais PER. Courbe d'acquisition
  0 % → 100 %, témoins non apparié / inversé / gelé plats, Fisher p = 1,66·10⁻⁹.
  Mesures et limites : `docs/superpowers/notes/2026-07-31-voie-olfactive-lot1.md`.
- **À venir** : généralisation (calibration de l'espace d'odeurs), discrimination
  A+/B−, SER aversif, puis échelle complète.

⚠️ Le mot « abeille » n'apparaît ni dans le code ni dans l'interface avant que le lot 3
soit passé (règle de nommage décidée le 2026-07-30).

## Conventions

- Commentaires, noms de tests et messages de commit en **français**.
- Aucune fonction transcendante (`exp`, `log`, `cos`, `sin`, `atan2`, `hypot`, `cbrt`)
  dans un chemin exécuté à chaque tick — c'est ce qui rend l'état reproductible au bit
  près entre moteurs JavaScript.
- L'ordre du tick de `stepLif` est **non négociable** (voir `src/sim/lif.ts`).
- Aucun chiffre sans statut dans la documentation (voir le journal de calibration).
