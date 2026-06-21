import { describe, it, expect } from "vitest";

// ATTAQUE DU MUR — preuve de principe, headless et auto-contenue (AUCUN changement moteur).
// Mini réseau excitable à ARÊTES ORIENTÉES (poids directionnel W[i→j], distinct de W[j→i])
// + STDP (pré@t-1 → post@t = LTP ; ordre inverse = LTD). Question : apprend-il une SÉQUENCE
// temporelle 0→1→2→3 et la REJOUE-t-il (clamp de A seul → B,C,D en cascade) — ce que le Hebb
// same-tick ne peut prouvablement PAS (les étages ne co-déchargent jamais le même tick) ?

const N = 6; // 0→1→2→3 = séquence ; 4,5 = distracteurs
const SEQ = [0, 1, 2, 3];
const R = 1, THETA = 4, LTP = 2, LTD = 1, WMAX = 8;

type Rule = "stdp" | "hebb";

interface Net { state: number[]; cooldown: number[]; W: Float64Array } // W[i*N+j] = poids orienté i→j
function makeNet(): Net {
  return { state: new Array(N).fill(0), cooldown: new Array(N).fill(0), W: new Float64Array(N * N) };
}

/** Un tick : clamp force des neurones à décharger ; sinon décharge si Σ entrants orientés ≥ θ. */
function tick(net: Net, clamp: number[], rule: Rule): void {
  const { state, cooldown, W } = net;
  const pre = state.slice();
  const next = new Array(N).fill(0);
  const clampSet = new Set(clamp);
  for (let j = 0; j < N; j++) {
    if (clampSet.has(j)) { next[j] = 1; continue; }
    if (cooldown[j] > 0) { next[j] = 0; continue; }
    if (state[j] === 1) { next[j] = 0; continue; } // excité → réfractaire
    let drive = 0;
    for (let i = 0; i < N; i++) if (state[i] === 1) drive += W[i * N + j]; // entrants orientés i→j
    next[j] = drive >= THETA ? 1 : 0;
  }
  for (let j = 0; j < N; j++) cooldown[j] = state[j] === 1 ? R : Math.max(0, cooldown[j] - 1);
  // Plasticité
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i === j) continue;
    let d = 0;
    if (rule === "stdp") {
      // orienté & causal : pré(i)@t-1 → post(j)@t renforce i→j ; ordre inverse l'affaiblit
      d = LTP * (pre[i] === 1 && next[j] === 1 ? 1 : 0) - LTD * (pre[j] === 1 && next[i] === 1 ? 1 : 0);
    } else {
      // Hebb same-tick : crédite la CO-décharge au même instant (post(i)&post(j))
      d = LTP * (next[i] === 1 && next[j] === 1 ? 1 : 0);
    }
    if (d !== 0) net.W[i * N + j] = Math.min(WMAX, Math.max(0, W[i * N + j] + d));
  }
  for (let j = 0; j < N; j++) state[j] = next[j];
}

function quiesce(net: Net) { net.state.fill(0); net.cooldown.fill(0); }

/** Entraîne en présentant la séquence M fois (un étage clampé par tick). */
function train(net: Net, rule: Rule, M: number): void {
  for (let m = 0; m < M; m++) {
    quiesce(net);
    for (const k of SEQ) tick(net, [k], rule);
  }
}

/** Rappel : clamp A=0 au 1er tick seulement, puis laisse courir ; renvoie qui décharge à chaque tick. */
function recall(net: Net): number[][] {
  quiesce(net);
  const fired: number[][] = [];
  for (let t = 0; t < SEQ.length; t++) {
    tick(net, t === 0 ? [SEQ[0]] : [], "stdp"); // plasticité sans effet au rappel (on lit juste)
    fired.push([...Array(N).keys()].filter((j) => net.state[j] === 1));
  }
  return fired;
}

/** Score de replay : fraction des étages B,C,D qui s'allument au bon tick après A seul. */
function replayScore(net: Net): number {
  const fired = recall(net);
  let ok = 0;
  for (let t = 1; t < SEQ.length; t++) if (fired[t].includes(SEQ[t])) ok++;
  return ok / (SEQ.length - 1);
}

describe("[GATE] attaque du mur : STDP + arêtes orientées apprennent une séquence", () => {
  it("STDP rejoue la séquence (A seul → B→C→D) ; Hebb same-tick non", () => {
    const stdp = makeNet(); train(stdp, "stdp", 4); const sStdp = replayScore(stdp);
    const hebb = makeNet(); train(hebb, "hebb", 4); const sHebb = replayScore(hebb);
    const wChain = (net: Net) => SEQ.slice(0, -1).map((i, k) => net.W[i * N + SEQ[k + 1]].toFixed(0)).join("→");
    // eslint-disable-next-line no-console
    console.log(`\n[MUR] STDP : replay=${(sStdp * 100).toFixed(0)}%  poids chaîne 0→1→2→3 : [${wChain(stdp)}]`);
    // eslint-disable-next-line no-console
    console.log(`[MUR] Hebb same-tick : replay=${(sHebb * 100).toFixed(0)}%  poids chaîne : [${wChain(hebb)}]`);
    // eslint-disable-next-line no-console
    console.log(`[MUR] → la séquence temporelle est ${sStdp >= 1 && sHebb < 0.5 ? "APPRISE par STDP, PAS par Hebb ✅ (mur franchi en principe)" : "non franchie"}\n`);
    expect(sStdp).toBe(1); // STDP rejoue parfaitement la séquence
    expect(sHebb).toBeLessThan(0.5); // Hebb same-tick en est incapable
  });
});
