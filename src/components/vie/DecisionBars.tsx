"use client";

// La décision en train de se former : quatre accumulateurs moteurs courent vers
// le seuil (trait vertical). Le gagnant franchit, la barre flashe, tout repart à
// zéro. Largeurs écrites directement dans le DOM à 60 fps — pas de re-rendu React.

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { ACTIONS, type MotorAction } from "@/sim/params";
import type { VieSnapshot } from "@/sim/snapshot";

interface Props {
  snapRef: RefObject<VieSnapshot | null>;
}

const LABELS: Record<MotorAction, string> = {
  GAUCHE: "← gauche",
  DROITE: "droite →",
  AVANCER: "avancer",
  STOP: "stop",
};

const COULEURS: Record<MotorAction, string> = {
  GAUCHE: "#4dd8ff",
  DROITE: "#4dd8ff",
  AVANCER: "#3ddc84",
  STOP: "#ffb84d",
};

export default function DecisionBars({ snapRef }: Props) {
  const barsRef = useRef<Array<HTMLDivElement | null>>([]);
  const rowsRef = useRef<Array<HTMLDivElement | null>>([]);
  const flashRef = useRef<Record<MotorAction, number>>({
    GAUCHE: 0,
    DROITE: 0,
    AVANCER: 0,
    STOP: 0,
  });
  const decisionVue = useRef<MotorAction | null>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const snap = snapRef.current;
      if (!snap) return;
      const now = performance.now();

      // Une décision vient de tomber → la rangée correspondante flashe ~350 ms.
      if (snap.lastDecision && snap.lastDecision !== decisionVue.current) {
        decisionVue.current = snap.lastDecision;
        flashRef.current[snap.lastDecision] = now;
      }
      if (snap.ticksSinceDecision === 0 && snap.lastDecision) {
        decisionVue.current = snap.lastDecision;
        flashRef.current[snap.lastDecision] = now;
      }

      for (let k = 0; k < ACTIONS.length; k++) {
        const a = ACTIONS[k];
        const bar = barsRef.current[k];
        const row = rowsRef.current[k];
        if (!bar || !row) continue;
        const frac = Math.min(1, snap.acc[k] / snap.accSeuil);
        bar.style.width = `${(frac * 100).toFixed(1)}%`;
        const flash = Math.max(0, 1 - (now - flashRef.current[a]) / 350);
        row.style.background =
          flash > 0 ? `rgba(255,255,255,${(flash * 0.14).toFixed(3)})` : "transparent";
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [snapRef]);

  return (
    <div className="flex flex-col gap-1.5">
      {ACTIONS.map((a, k) => (
        <div
          key={a}
          ref={(el) => {
            rowsRef.current[k] = el;
          }}
          className="rounded-md px-2 py-1"
        >
          <div className="mb-0.5 flex items-center justify-between font-mono text-[10px] tracking-wider text-white/45 uppercase">
            <span>{LABELS[a]}</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              ref={(el) => {
                barsRef.current[k] = el;
              }}
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: "0%", background: COULEURS[a] }}
            />
            {/* Le seuil : franchir cette ligne = décider. */}
            <div className="absolute inset-y-0 right-0 w-px bg-white/50" />
          </div>
        </div>
      ))}
    </div>
  );
}
