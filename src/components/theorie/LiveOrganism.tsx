"use client";

// Mini-organisme vivant embarqué : monte la simulation de fourrage réelle
// et la pause automatiquement quand le composant sort de l'écran (économie CPU).

import { useEffect, useRef } from "react";
import { useReservoirCreature } from "@/hooks/useReservoirCreature";
import { ReservoirCreatureView } from "@/components/ReservoirCreatureView";
import type { ThemeCanvas } from "@/lib/themes";

export function LiveOrganism({ theme }: { theme: ThemeCanvas }) {
  const { worldRef, stats, running, version, toggleRun, reset } =
    useReservoirCreature();

  const boxRef = useRef<HTMLDivElement>(null);

  // Ref miroir de `running` — mis à jour dans un effet pour le lire dans l'observer
  // sans recréer l'effet à chaque changement d'état.
  const runningRef = useRef(running);
  useEffect(() => {
    runningRef.current = running;
  });

  // Mémorise si la simulation tournait au moment de la sortie d'écran,
  // pour ne reprendre automatiquement que si l'utilisateur n'a pas mis en pause.
  const wasRunning = useRef(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) {
          // L'élément quitte l'écran — mémoriser l'état courant puis pauser.
          wasRunning.current = runningRef.current;
          if (runningRef.current) toggleRun();
        } else if (wasRunning.current && !runningRef.current) {
          // L'élément revient à l'écran ET tournait avant (pas de pause manuelle).
          toggleRun();
          wasRunning.current = false;
        }
      },
      { threshold: 0.1 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [toggleRun]); // toggleRun est stable (useCallback sans dépendances changeantes)

  return (
    <div
      ref={boxRef}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30"
    >
      {/* Arène de la créature */}
      <div className="relative h-64">
        <ReservoirCreatureView
          worldRef={worldRef}
          version={version}
          theme={theme}
        />
      </div>

      {/* Bandeau de stats + contrôles */}
      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-2 font-mono text-[11px] text-white/55">
        <span>
          mangé :{" "}
          <span className="text-white/85">{stats.eaten}</span>
          {" · "}
          rythme/500 :{" "}
          <span className="text-white/85">{stats.ratePer500}</span>
        </span>
        <span className="flex gap-2">
          <button
            onClick={toggleRun}
            className="rounded border border-white/10 px-2 py-0.5 hover:bg-white/5"
          >
            {running ? "pause" : "reprendre"}
          </button>
          <button
            onClick={reset}
            className="rounded border border-white/10 px-2 py-0.5 hover:bg-white/5"
          >
            relancer
          </button>
        </span>
      </div>
    </div>
  );
}
