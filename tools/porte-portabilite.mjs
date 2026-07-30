// Porte (d) du lot 0 : l'organisme complet doit donner un état identique AU BIT PRÈS sous deux
// moteurs JavaScript différents. Node utilise V8, Bun utilise JavaScriptCore — le moteur de
// Safari, donc celui du navigateur cible.
//
// MÉTHODE. Le noyau est bundlé UNE SEULE FOIS, puis le MÊME fichier est exécuté sous les deux
// moteurs. Bundler deux fois masquerait une différence de compilation derrière ce qu'on croirait
// être une différence de moteur.
//
// SI LA PORTE ÉCHOUE, la cause est une fonction transcendante subsistant dans un chemin exécuté
// à chaque tick — `Math.exp`, `log`, `cos`, `sin`, `atan2`, `hypot`, `cbrt` ne sont pas
// spécifiés au bit près par ECMAScript. Les débusquer avec :
//   grep -nE "Math\.(exp|log|cos|sin|atan2|hypot|cbrt)" src/sim/*.ts
// Une transcendante appelée UNE FOIS à la construction et dont le résultat est stocké en
// Float32Array est en revanche sans danger : l'espacement f32 (~6e-8 près de 1) écrase de huit
// ordres de grandeur le désaccord entre moteurs (~1e-16 en double).

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TICKS = 20_000;

// L'entrée vit dans le répertoire temporaire, jamais dans le dépôt : ses imports sont donc
// ABSOLUS, résolus depuis la racine du projet passée par `process.cwd()`.
const racine = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "porte-"));
const entree = join(dir, "entree.ts");
writeFileSync(
  entree,
  `import { mulberry32 } from ${JSON.stringify(join(racine, "src/lib/rng"))};
import { createOrganism, runOrganism } from ${JSON.stringify(join(racine, "src/sim/organism"))};
import { ORGANISME_DEFAUT } from ${JSON.stringify(join(racine, "src/sim/params"))};
import { empreinteOrganisme } from ${JSON.stringify(join(racine, "src/sim/portabilite"))};
const p = { ...ORGANISME_DEFAUT, brain: { ...ORGANISME_DEFAUT.brain,
  topology: { ...ORGANISME_DEFAUT.brain.topology, n: 2500, seed: 4 } } };
const org = createOrganism(p);
runOrganism(org, ${TICKS}, mulberry32(7));
console.log(empreinteOrganisme(org));
`,
);

const bundle = join(dir, "bundle.mjs");
execFileSync("bun", ["build", entree, "--target=node", "--outfile", bundle], { stdio: "inherit" });

const sousNode = execFileSync("node", [bundle], { encoding: "utf8" }).trim();
const sousBun = execFileSync("bun", [bundle], { encoding: "utf8" }).trim();

console.log(`\nNode (V8)  : ${sousNode}`);
console.log(`Bun  (JSC) : ${sousBun}`);
if (sousNode !== sousBun) {
  console.error(`\n❌ PORTE ÉCHOUÉE : les deux moteurs divergent sur ${TICKS} ticks.`);
  process.exit(1);
}
console.log(`\n✅ PORTE PASSÉE : état identique au bit près sous V8 et JSC (${TICKS} ticks).`);
