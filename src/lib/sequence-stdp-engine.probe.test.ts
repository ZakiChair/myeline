import { describe, it, expect } from "vitest";
import { scaleGraphFromEdges, stepScale, type ScaleGraph } from "./scale-engine";
import { mulberry32 } from "./rng";
import { DEFAULT_PARAMS } from "./rules";
import type { SimParams } from "./types";

// INC.4 — preuve de replay de séquence sur le VRAI moteur Échelle (pas le mini-gate jouet).
// Reprend la preuve de principe de sequence-stdp.probe.test.ts, mais exercée à travers
// stepScale + clamp de sortie (inc.4) + poids directionnels persistants (inc.1-3).
//
// Chaîne 0→1→2→3→4. φ ÉLEVÉ (0.6) ⇒ un seul voisin excité (fraction brute 0.5) ne suffit
// PAS à propager au départ : seul l'apprentissage qui REND l'arête avant dominante (edgeW≈14
// vs edgeWb→0) peut faire passer la conduction au-dessus du seuil. Donc replay ⇒ appris.
//
// Entraînement : clamp de SORTIE de SEQ[t] à chaque tick (séquence présentée étage par étage).
// Comme on ne quiesce pas entre étages consécutifs, state[SEQ[t-1]]=1 (pré t-1) et
// stateNext[SEQ[t]]=1 (post t) ⇒ STDP renforce SEQ[t-1]→SEQ[t]. Rappel : clamp d'entrée de
// SEQ[0] seul, puis on laisse courir — la cascade ne s'allume que si la chaîne a été apprise.

const SEQ = [0, 1, 2, 3, 4];

function chain(): ScaleGraph {
  // Arêtes non orientées de la chaîne (slot a < slot b).
  return scaleGraphFromEdges(
    SEQ.map(() => ({ state: 0 as const })),
    [[0, 1], [1, 2], [2, 3], [3, 4]],
  );
}

const P = (over: Partial<SimParams>): SimParams => ({
  ...DEFAULT_PARAMS,
  spontaneous: 0, // déterministe, pas d'étincelle
  refractory: 1,
  fireFraction: 0.6, // > 0.5 ⇒ un voisin symétrique ne propage pas (apprentissage requis)
  hebbian: true,
  ...over,
});

function quiesce(g: ScaleGraph): void {
  g.state.fill(0);
  g.stateNext.fill(0);
  g.cooldown.fill(0);
}

const RNG = mulberry32(1); // jamais consommé (spontaneous=0), présent pour la signature

/** Présente la séquence M fois ; à chaque tick, clamp de SORTIE de l'étage courant. */
function train(g: ScaleGraph, plasticity: "stdp" | "hebb", M: number): void {
  const p = P({ plasticity });
  for (let m = 0; m < M; m++) {
    quiesce(g);
    for (const stage of SEQ) stepScale(g, p, RNG, false, [stage]);
  }
}

/** Rappel : clamp de SORTIE de SEQ[0] seul au 1er tick (cue), puis libre. Poids gelés. */
function replayScore(g: ScaleGraph): number {
  quiesce(g);
  const p = P({ hebbian: false, plasticity: "stdp" });
  const fired: number[][] = [];
  for (let t = 0; t < SEQ.length; t++) {
    // t=0 : clamp de sortie du cue (force SEQ[0] sans le piloter, comme le mini-gate) ⇒
    // SEQ[k] doit s'allumer au tick k par propagation apprise. Sans clamp, applyInput
    // mettrait le cue en état COURANT et propagerait dès le 1er step (cascade décalée).
    stepScale(g, p, RNG, false, t === 0 ? [SEQ[0]] : undefined);
    fired.push(SEQ.filter((j) => g.state[j] === 1));
  }
  let ok = 0;
  for (let t = 1; t < SEQ.length; t++) if (fired[t].includes(SEQ[t])) ok++;
  return ok / (SEQ.length - 1);
}

/** Poids directionnels de la chaîne (sens avant SEQ[k]→SEQ[k+1]). */
function fwdChain(g: ScaleGraph): number[] {
  const out: number[] = [];
  for (let k = 0; k < SEQ.length - 1; k++) {
    const a = SEQ[k];
    for (let e = 0; e < g.edgeCount; e++) {
      if (g.edgeA[e] === a && g.edgeB[e] === SEQ[k + 1]) out.push(g.edgeW[e]);
    }
  }
  return out;
}

describe("[GATE inc.4] replay de séquence sur le moteur Échelle réel (STDP + clamp + arêtes orientées)", () => {
  it("STDP rejoue 0→1→2→3→4 ; Hebb same-tick non", () => {
    const stdp = chain();
    train(stdp, "stdp", 8);
    const sStdp = replayScore(stdp);

    const hebb = chain();
    train(hebb, "hebb", 8);
    const sHebb = replayScore(hebb);

    // eslint-disable-next-line no-console
    console.log(`\n[MUR/moteur] STDP : replay=${(sStdp * 100).toFixed(0)}%  chaîne avant=[${fwdChain(stdp).map((w) => w.toFixed(1)).join("→")}]`);
    // eslint-disable-next-line no-console
    console.log(`[MUR/moteur] Hebb : replay=${(sHebb * 100).toFixed(0)}%  chaîne avant=[${fwdChain(hebb).map((w) => w.toFixed(1)).join("→")}]`);
    // eslint-disable-next-line no-console
    console.log(`[MUR/moteur] → mur ${sStdp >= 1 && sHebb < 0.5 ? "FRANCHI sur le vrai moteur ✅" : "non franchi"}\n`);

    expect(sStdp).toBe(1); // la STDP apprend la chaîne directionnelle → replay parfait
    expect(sHebb).toBeLessThan(0.5); // Hebb same-tick reste symétrique → pas de propagation
  });
});
