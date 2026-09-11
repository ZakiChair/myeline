// PORTE DU RANG 3 — SER aversif et dissociation des canaux de modulation.
//
// Référence publiée (Vergoz et al. 2007) : CS odeur 5 s, US choc 2 s finissant
// exactement à l'extinction du CS (ISI 3 s), 6 essais, réponse conditionnée en
// montée chez l'apparié (F(5,190) = 8,46, p < 0,0001), plate chez le non apparié.
//
// LA PORTE À TROIS VOLETS, sur le MÊME cerveau (même graine ⇒ même câblage,
// répliqué sous chaque condition de lésion — plan intra-sujet) :
//
//   1. SER apparié monte ; SER non apparié plat (Fisher au dernier essai < 0,01).
//   2. PER appétitif fonctionne TOUJOURS sur ce cerveau.
//   3. LÉSIONS DISSOCIÉES : canal OA coupé → PER mort, SER intact ; canal DA coupé
//      → SER mort, PER intact. Et les deux réflexes innés survivent à toute
//      lésion — la lésion coupe l'apprentissage, pas le réflexe (lecture fidèle
//      des bloqueurs pharmacologiques publiés : flupentixol ↔ canal DA, épinastine
//      ↔ canal OA).
//
// C'est le test d'architecture : un seul neuromodulateur scalaire ne peut pas
// passer — on ne peut pas léser un signe. Il fallait deux canaux (OA appétitif /
// DA aversif — l'assignation de l'insecte) consolidant chacun sa couche de sortie.
//
// ÉCART assumé à la notation publiée : chez l'animal on note pendant le choc
// (événement binaire) ; ici la lecture en taux sature sous le réflexe (mesuré :
// l'UR occupe le plafond du réfractaire) → on note l'anticipation [CS, US), même
// contenu fonctionnel que le PER.
//
// CONFIGURATION : 16 sujets (banc), n = 2 500, durées physiologiques.

import { describe, expect, it } from "vitest";
import { mulberry32 } from "../lib/rng";
import { LIF_DEFAUT, PLASTICITE_DEFAUT, VOIE_DEFAUT } from "./params";
import { fisherExact } from "./protocols/stats";
import { genererOdeur } from "./tasks/odors";
import {
  calibrerSeuil,
  reflexeAversif,
  reflexeInconditionnel,
  runEssai,
  PER_DEFAUT,
} from "./tasks/per";
import {
  essaiApparie,
  essaiChocSeul,
  essaiSerPaire,
  essaiSerSeul,
  itiTicks,
  ENVELOPPE_SER,
} from "./tasks/schedules";
import { createVoie } from "./voie";

const N_SUJETS = 16;
const N_SER = 6;
const N_PER = 5;
const PER_SER = { ...PER_DEFAUT, env: ENVELOPPE_SER };

type Bras = "intact" | "lesionOA" | "lesionDA" | "nonApparie";

interface MesureBras {
  ser: boolean[];
  per: boolean[];
  urSer: boolean;
  urPer: boolean;
}

function mesurer(s: number, bras: Bras): MesureBras {
  const v = createVoie(
    { ...VOIE_DEFAUT, n: 2_500, seed: 0x2b9927 ^ s },
    LIF_DEFAUT,
    { ...PLASTICITE_DEFAUT, lr: 0.05 },
  );
  if (bras === "lesionOA") v.lesions.oa = true;
  if (bras === "lesionDA") v.lesions.da = true;
  const rng = mulberry32(0xfeed ^ s);
  const rng0 = mulberry32(0x51ab ^ s);
  const odeurS = genererOdeur(rng0, v.params.nGlom, `S-${s}`);
  const odeurP = genererOdeur(rng0, v.params.nGlom, `P-${s}`);
  const iti = itiTicks(PLASTICITE_DEFAUT.tauElig, PER_DEFAUT.margeITI);

  // ── SER.
  const { seuil: seuilS } = calibrerSeuil(v, odeurS, PER_SER, PLASTICITE_DEFAUT, 8, 0.05, rng, essaiSerSeul);
  const { urBase } = reflexeAversif(v, PER_SER, PLASTICITE_DEFAUT, 3, rng);
  const ser: boolean[] = [];
  for (let k = 0; k < N_SER; k++) {
    if (bras === "nonApparie") {
      // CS seul noté + choc seul non noté, alternés — même stimuli, jamais liés.
      ser.push(runEssai(v, essaiSerSeul(ENVELOPPE_SER, odeurS, iti), PER_SER, seuilS, rng).reponse);
      runEssai(v, essaiChocSeul(ENVELOPPE_SER, iti), PER_SER, 0, rng);
    } else {
      ser.push(runEssai(v, essaiSerPaire(ENVELOPPE_SER, odeurS, iti), PER_SER, seuilS, rng).reponse);
    }
  }

  // ── PER sur le même cerveau, autre odeur.
  const { seuil: seuilP } = calibrerSeuil(v, odeurP, PER_DEFAUT, PLASTICITE_DEFAUT, 8, 0.05, rng);
  const urPer = reflexeInconditionnel(v, PER_DEFAUT, PLASTICITE_DEFAUT, seuilP, rng);
  const per: boolean[] = [];
  for (let k = 0; k < N_PER; k++) {
    per.push(runEssai(v, essaiApparie(PER_DEFAUT.env, odeurP, iti), PER_DEFAUT, seuilP, rng).reponse);
  }
  return { ser, per, urSer: urBase > 100, urPer };
}

describe("porte du rang 3 — SER aversif + dissociation des canaux", () => {
  it(
    "SER monte, PER tient, et les lésions OA/DA dissocient les deux apprentissages",
    () => {
      const bras: Record<Bras, MesureBras[]> = {
        intact: [],
        lesionOA: [],
        lesionDA: [],
        nonApparie: [],
      };
      for (let s = 0; s < N_SUJETS; s++) {
        for (const b of ["intact", "lesionOA", "lesionDA", "nonApparie"] as const) {
          bras[b].push(mesurer(s, b));
        }
      }
      const dernier = (m: MesureBras[], cle: "ser" | "per") =>
        m.filter((x) => x[cle][x[cle].length - 1]).length;
      const r = (m: MesureBras[], cle: "ser" | "per") =>
        m.map((x) => x[cle].map((v) => (v ? 1 : 0)));

      // Volet 3b : les réflexes innés survivent à TOUTES les lésions.
      for (const b of Object.keys(bras) as Bras[]) {
        const m = bras[b];
        expect(m.every((x) => x.urSer && x.urPer)).toBe(true);
      }

      for (const b of Object.keys(bras) as Bras[]) {
        const m = bras[b];
        console.log(
          `[RANG3] ${b.padEnd(10)} dernier essai : SER ${dernier(m, "ser")}/${N_SUJETS} | PER ${dernier(m, "per")}/${N_SUJETS}`,
        );
        const mSer = r(m, "ser");
        const courbeSer = mSer[0].map((_, k) => mSer.reduce((acc, c) => acc + c[k], 0));
        const mPer = r(m, "per");
        const courbePer = mPer[0].map((_, k) => mPer.reduce((acc, c) => acc + c[k], 0));
        console.log(
          `[RANG3] ${b.padEnd(10)} courbe SER ${courbeSer.map((c) => `${((c / N_SUJETS) * 100).toFixed(0)}%`).join(" ")}` +
          ` | courbe PER ${courbePer.map((c) => `${((c / N_SUJETS) * 100).toFixed(0)}%`).join(" ")}`,
        );
      }

      // Volet 1 : SER apparié monte, non apparié plat — Fisher au dernier essai.
      const pSer = fisherExact(
        dernier(bras.intact, "ser"),
        N_SUJETS - dernier(bras.intact, "ser"),
        dernier(bras.nonApparie, "ser"),
        N_SUJETS - dernier(bras.nonApparie, "ser"),
      );
      console.log(`[RANG3] Fisher SER apparié vs non apparié → p=${pSer.toExponential(2)}`);
      expect(pSer).toBeLessThan(0.01);

      // Volet 2 : le PER fonctionne sur le même cerveau.
      expect(dernier(bras.intact, "per")).toBeGreaterThanOrEqual(Math.ceil(N_SUJETS * 0.6));

      // Volet 3a : la dissociation. OA coupé → PER mort, SER vivant ;
      // DA coupé → SER mort, PER vivant.
      expect(dernier(bras.lesionOA, "ser")).toBeGreaterThanOrEqual(Math.ceil(N_SUJETS * 0.6));
      expect(dernier(bras.lesionOA, "per")).toBeLessThanOrEqual(2);
      expect(dernier(bras.lesionDA, "per")).toBeGreaterThanOrEqual(Math.ceil(N_SUJETS * 0.6));
      expect(dernier(bras.lesionDA, "ser")).toBeLessThanOrEqual(2);
    },
    90 * 60_000,
  );
});
