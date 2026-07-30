// Sonde de calibration : on cherche le régime où le réseau ne s'éteint pas et ne s'emballe
// pas, SANS plasticité. Les seuils de ce fichier sont issus de la MESURE, jamais d'une
// intuition — voir docs/superpowers/notes/2026-07-30-vie-calibration.md.
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { buildTopology, poolRange, regionById } from "./topology";
import { createLif, stepLif } from "./lif";
import { DRIVE_CALIBRE, LIF_DEFAUT, TAUX_CIBLE, TAUX_SPONTANE, TOPOLOGIE_DEFAUT } from "./params";

const FENETRE = 200;

/** Fait tourner le réseau avec une excitation de fond et renvoie le taux par fenêtre. */
function profil(
  n: number,
  seed: number,
  ticks: number,
  drive: number,
  surTopo: Partial<typeof TOPOLOGIE_DEFAUT> = {},
  surLif: Partial<typeof LIF_DEFAUT> = {},
): number[] {
  const topo = buildTopology({ ...TOPOLOGIE_DEFAUT, n, seed, ...surTopo });
  const lifP = { ...LIF_DEFAUT, ...surLif };
  const st = createLif(topo, lifP);
  const rng = mulberry32(seed ^ 0x5eed);
  const ctx = regionById(topo, "CORTEX");
  const taux: number[] = [];
  let cumul = 0;
  for (let k = 0; k < ticks; k++) {
    // Excitation de fond : un neurone cortical sur 17 reçoit un courant constant.
    for (let i = ctx.start; i < ctx.start + ctx.count; i += 17) st.inject[i] = drive;
    cumul += stepLif(topo, st, lifP, rng);
    if ((k + 1) % FENETRE === 0) {
      taux.push(cumul / (FENETRE * st.n));
      cumul = 0;
    }
  }
  return taux;
}


/**
 * Régime sous entrée SENSORIELLE (le chemin réel), et non sous courant cortical uniforme.
 * Une entrée localisée dans un territoire de rayon sigmaExc peut y produire un emballement
 * local qu'une moyenne globale ne verrait pas. On relève donc le taux PAR RÉGION et le taux
 * du neurone cortical le plus actif.
 */
function profilSensoriel(
  n: number,
  seed: number,
  ticks: number,
  gain: number,
  surTopo: Partial<typeof TOPOLOGIE_DEFAUT> = {},
) {
  const topo = buildTopology({ ...TOPOLOGIE_DEFAUT, n, seed, ...surTopo });
  const st = createLif(topo, LIF_DEFAUT);
  const rng = mulberry32(seed ^ 0x5eed);
  const olf = regionById(topo, "OLF_FOOD");
  const ctx = regionById(topo, "CORTEX");
  // Une bouffée d'odeur : trois secteurs voisins excités, comme le fera le codage par
  // population de la tâche 6.
  const actifs: number[] = [];
  for (const pool of [5, 6, 7]) {
    const { start, end } = poolRange(olf, pool);
    for (let i = start; i < end; i++) actifs.push(i);
  }
  // Le TERRITOIRE = les neurones corticaux réellement visés par ces capteurs. C'est là que
  // le signal doit se lire ; comparer à la moyenne corticale globale ne dit rien.
  const territoire = new Uint8Array(topo.n);
  for (const i of actifs) {
    for (let e = topo.outOffsets[i]; e < topo.outOffsets[i + 1]; e++) territoire[topo.outTarget[e]] = 1;
  }
  for (let k = 0; k < ticks; k++) {
    for (const i of actifs) st.inject[i] = gain;
    stepLif(topo, st, LIF_DEFAUT, rng);
  }
  let stim = 0;
  for (const i of actifs) stim += st.spikeTotal[i];
  stim /= actifs.length * ticks;

  let sTerr = 0;
  let nTerr = 0;
  let sReste = 0;
  let nReste = 0;
  let maxNeurone = 0;
  let chauds = 0;
  for (let i = ctx.start; i < ctx.start + ctx.count; i++) {
    const taux = st.spikeTotal[i] / ticks;
    if (taux > maxNeurone) maxNeurone = taux;
    if (taux > 0.15) chauds++; // 60 % du plafond imposé par le réfractaire
    if (territoire[i] === 1) {
      sTerr += taux;
      nTerr++;
    } else {
      sReste += taux;
      nReste++;
    }
  }
  return {
    stim,
    maxNeurone,
    chauds,
    territoire: nTerr > 0 ? sTerr / nTerr : 0,
    reste: sReste / nReste,
    tailleTerritoire: nTerr,
  };
}

const moy = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("calibration du régime (sans plasticité)", () => {
  // Mesures du 2026-07-30, wSensory = 0,4 : le territoire passe de 0,0088 (repos) à 0,0205 /
  // 0,0320 / 0,0414 pour des gains 0,05 / 0,2 / 0,6, pendant que le reste du cortex reste
  // entre 0,0101 et 0,0116. À wSensory = wExc, le contraste tombait à ×1,6.
  it("laisse une entrée sensorielle localisée allumer un territoire cortical identifiable", () => {
    const repos = profilSensoriel(3000, 5, 2000, 0);
    const actif = profilSensoriel(3000, 5, 2000, 0.2);
    expect(actif.territoire).toBeGreaterThan(repos.territoire * 2.5); // observé ×3,6
    expect(actif.reste).toBeLessThan(repos.reste * 1.5); // le reste du cortex n'est pas contaminé
    expect(actif.chauds).toBeLessThanOrEqual(20); // pas d'emballement local (observé 0)
  }, 300_000);

  it("code l'intensité de l'odeur, et pas seulement sa présence", () => {
    // Sans cette propriété, l'organisme saurait qu'il y a de la nourriture mais pas si elle
    // est proche : aucun gradient à suivre.
    const faible = profilSensoriel(3000, 5, 2000, 0.05);
    const fort = profilSensoriel(3000, 5, 2000, 0.6);
    expect(fort.territoire).toBeGreaterThan(faible.territoire * 1.5); // observé 0,0205 → 0,0414
    expect(fort.chauds).toBeLessThanOrEqual(20); // observé 1
  }, 300_000);

  // Bornes issues de la mesure du 2026-07-30 : le régime entretenu tient entre 0,0203 et
  // 0,0250 sur 3 graines et de n = 3 000 à n = 12 000, avec une dérive début→fin ≤ 0,0013.
  it("tient un régime stable, ni éteint ni emballé, sur 3000 ticks", () => {
    const taux = profil(3000, 5, 3000, DRIVE_CALIBRE);
    const debut = moy(taux.slice(0, 3));
    const fin = moy(taux.slice(-3));
    expect(fin).toBeGreaterThan(TAUX_CIBLE * 0.4); // pas d'extinction
    expect(fin).toBeLessThan(TAUX_CIBLE * 2.5); // pas d'emballement
    expect(Math.abs(fin - debut)).toBeLessThan(TAUX_CIBLE * 0.25); // profil plat
  }, 300_000);

  it("garde le même régime sur d'autres graines", () => {
    for (const seed of [99, 7]) {
      const fin = moy(profil(3000, seed, 3000, DRIVE_CALIBRE).slice(-3));
      expect(fin).toBeGreaterThan(TAUX_CIBLE * 0.4);
      expect(fin).toBeLessThan(TAUX_CIBLE * 2.5);
    }
  }, 300_000);

  it("garde le même régime à n plus grand", () => {
    // Si le régime dépendait de n, la montée à 50 000 neurones échouerait au lot 2.
    const fin = moy(profil(12_000, 5, 2000, DRIVE_CALIBRE).slice(-3));
    expect(fin).toBeGreaterThan(TAUX_CIBLE * 0.3);
    expect(fin).toBeLessThan(TAUX_CIBLE * 3);
  }, 300_000);

  it("laisse l'entrée sensorielle moduler le taux : le cortex n'est pas saturé", () => {
    // C'est LA propriété que le réglage visait. Un cortex saturé ignorerait ses capteurs.
    const spontane = moy(profil(3000, 5, 3000, 0).slice(-3));
    const entretenu = moy(profil(3000, 5, 3000, DRIVE_CALIBRE).slice(-3));
    expect(spontane).toBeGreaterThan(TAUX_SPONTANE * 0.4); // le réseau ne s'éteint pas seul
    expect(entretenu).toBeGreaterThan(spontane * 1.8); // observé : ×2,3
  }, 300_000);
});
