// Sonde de calibration : on cherche le régime où le réseau ne s'éteint pas et ne s'emballe
// pas, SANS plasticité. Les seuils de ce fichier sont issus de la MESURE, jamais d'une
// intuition — voir docs/superpowers/notes/2026-07-30-vie-calibration.md.
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { buildTopology, regionById } from "./topology";
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

const moy = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("calibration du régime (sans plasticité)", () => {
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
