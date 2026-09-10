// Sonde : la plasticité et l'homéostasie ne doivent pas détruire le régime calibré.
// C'est ici qu'on attrape les deux modes d'échec nommés par la conception — la crise
// épileptique et l'extinction — et un troisième, plus sournois : l'homéostasie qui
// potentialise sans fin une région momentanément silencieuse.
import { describe, it, expect } from "vitest";
import { mulberry32 } from "../lib/rng";
import { buildTopology, poolRange, regionById } from "./topology";
import { createLif, stepLif } from "./lif";
import { accumulateEligibility, addDopamine, createPlasticity, homeostasis } from "./plasticity";
import {
  DRIVE_CALIBRE,
  LIF_DEFAUT,
  PLASTICITE_DEFAUT,
  TAUX_CIBLE,
  TAUX_HOMEO,
  TOPOLOGIE_DEFAUT,
  type RegionId,
} from "./params";

/** Neurones d'une région dont on stimule trois pools voisins. */
function poolsStimules(topo: ReturnType<typeof buildTopology>, id: RegionId, pools: number[]) {
  const r = regionById(topo, id);
  const out: number[] = [];
  for (const pool of pools) {
    const { start, end } = poolRange(r, pool);
    for (let i = start; i < end; i++) out.push(i);
  }
  return out;
}

/** Territoire cortical visé par un ensemble de neurones sensoriels. */
function territoireDe(topo: ReturnType<typeof buildTopology>, sources: number[]): number[] {
  const vu = new Uint8Array(topo.n);
  for (const i of sources) {
    for (let e = topo.outOffsets[i]; e < topo.outOffsets[i + 1]; e++) vu[topo.outTarget[e]] = 1;
  }
  const out: number[] = [];
  for (let i = 0; i < topo.n; i++) if (vu[i] === 1) out.push(i);
  return out;
}

/** Poids entrant excitateur moyen d'un groupe de neurones. */
function poidsEntrantMoyen(topo: ReturnType<typeof buildTopology>, groupe: number[]): number {
  let s = 0;
  let n = 0;
  for (const j of groupe) {
    for (let q = topo.inOffsets[j]; q < topo.inOffsets[j + 1]; q++) {
      const e = topo.inEdge[q];
      if (topo.w[e] > 0) {
        s += topo.w[e];
        n++;
      }
    }
  }
  return n > 0 ? s / n : 0;
}

describe("régime sous plasticité", () => {
  it("tient les bornes de calibration avec une dopamine de moyenne nulle", () => {
    const topo = buildTopology({ ...TOPOLOGIE_DEFAUT, n: 3000, seed: 5 });
    const lif = createLif(topo, LIF_DEFAUT);
    const ps = createPlasticity(topo, PLASTICITE_DEFAUT);
    const rng = mulberry32(0x5eed);
    const daRng = mulberry32(0xda);
    const ctx = regionById(topo, "CORTEX");
    const TICKS = 5000;
    const FEN = 200;
    const taux: number[] = [];
    let cumul = 0;
    for (let k = 0; k < TICKS; k++) {
      for (let i = ctx.start; i < ctx.start + ctx.count; i += 17) lif.inject[i] = DRIVE_CALIBRE;
      cumul += stepLif(topo, lif, LIF_DEFAUT, rng);
      accumulateEligibility(topo, lif, ps, PLASTICITE_DEFAUT);
      addDopamine(topo, lif, ps, PLASTICITE_DEFAUT, (daRng() - 0.5) * 0.4);
      if (lif.t % PLASTICITE_DEFAUT.homeoEvery === 0) {
        homeostasis(topo, lif, ps, PLASTICITE_DEFAUT, TAUX_HOMEO);
      }
      if ((k + 1) % FEN === 0) {
        taux.push(cumul / (FEN * lif.n));
        cumul = 0;
      }
    }
    const fin = taux.slice(-3).reduce((a, b) => a + b, 0) / 3;
    console.log(`plasticité active : profil=[${taux.map((x) => x.toFixed(4)).join(", ")}]`);
    expect(fin).toBeGreaterThan(TAUX_CIBLE * 0.3); // pas d'extinction
    expect(fin).toBeLessThan(TAUX_CIBLE * 3); // pas de crise
    for (let e = 0; e < topo.e; e++) expect(Number.isFinite(topo.w[e])).toBe(true);
  }, 600_000);

  it("ne laisse pas l'homéostasie potentialiser sans fin une région silencieuse", () => {
    // Une seule modalité stimulée : les territoires des autres restent près du taux spontané.
    // Si la cible de l'homéostasie était le régime ENTRETENU, ces territoires verraient leurs
    // poids gonfler jusqu'à décharger sans entrée — l'organisme hallucinerait ses capteurs.
    const topo = buildTopology({ ...TOPOLOGIE_DEFAUT, n: 3000, seed: 5 });
    const lif = createLif(topo, LIF_DEFAUT);
    const ps = createPlasticity(topo, PLASTICITE_DEFAUT);
    const rng = mulberry32(0x5eed);

    const stimules = poolsStimules(topo, "OLF_FOOD", [5, 6, 7]);
    const terrActif = territoireDe(topo, stimules);
    const terrMuet = territoireDe(topo, poolsStimules(topo, "ALARM", [0, 1, 2]));

    const avantActif = poidsEntrantMoyen(topo, terrActif);
    const avantMuet = poidsEntrantMoyen(topo, terrMuet);

    const TICKS = 6000;
    for (let k = 0; k < TICKS; k++) {
      for (const i of stimules) lif.inject[i] = 0.2;
      stepLif(topo, lif, LIF_DEFAUT, rng);
      accumulateEligibility(topo, lif, ps, PLASTICITE_DEFAUT);
      addDopamine(topo, lif, ps, PLASTICITE_DEFAUT, 0); // aucune récompense : seule l'homéostasie agit
      if (lif.t % PLASTICITE_DEFAUT.homeoEvery === 0) {
        homeostasis(topo, lif, ps, PLASTICITE_DEFAUT, TAUX_HOMEO);
      }
    }
    const apresActif = poidsEntrantMoyen(topo, terrActif);
    const apresMuet = poidsEntrantMoyen(topo, terrMuet);
    console.log(
      `territoire stimulé ${avantActif.toFixed(4)}→${apresActif.toFixed(4)} ` +
        `(×${(apresActif / avantActif).toFixed(3)}) | silencieux ${avantMuet.toFixed(4)}→` +
        `${apresMuet.toFixed(4)} (×${(apresMuet / avantMuet).toFixed(3)})`,
    );
    expect(apresMuet / avantMuet).toBeLessThan(2.0);
  }, 600_000);
});
