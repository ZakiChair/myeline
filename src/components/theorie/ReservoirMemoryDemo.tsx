"use client";

// Démonstration pédagogique (illustrative) de la mémoire du réservoir :
// un bouton « flasher » injecte une impulsion ; les cellules s'allument puis
// l'écho décroît exponentiellement sur quelques secondes.
// Pas de moteur réel — décroissance simple pour illustrer le concept.

import { useCallback, useEffect, useRef } from "react";
import type { ThemeCanvas } from "@/lib/themes";

// Nombre de cellules dans la rangée
const N = 32;
// Facteur de décroissance par frame (~60fps → ≈1.2 s pour tomber à 5 %)
const DECAY = 0.962;

export function ReservoirMemoryDemo({ theme }: { theme: ThemeCanvas }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Niveaux des cellules (0..1) mutés directement, sans passer par React state
  const levelsRef = useRef<number[]>(new Array(N).fill(0));

  const flash = useCallback(() => {
    // Injecte une impulsion uniforme dans toutes les cellules
    levelsRef.current = new Array(N).fill(1);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const levels = levelsRef.current;

      // Décroissance exponentielle à chaque frame
      for (let i = 0; i < N; i++) {
        levels[i] *= DECAY;
        if (levels[i] < 0.005) levels[i] = 0;
      }

      const r = canvas.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      ctx.clearRect(0, 0, w, h);

      const cellW = w / N;
      const bw = Math.max(2, cellW * 0.55);

      for (let i = 0; i < N; i++) {
        const lv = levels[i];
        if (lv < 0.005) {
          // Cellule au repos — petit repère discret
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = theme.rest;
          ctx.shadowBlur = 0;
          const barH = h * 0.14;
          const x = i * cellW + cellW / 2;
          ctx.fillRect(x - bw / 2, h / 2 - barH / 2, bw, barH);
        } else {
          // Cellule active — hauteur et éclat proportionnels au niveau
          const barH = h * (0.16 + lv * 0.68);
          const x = i * cellW + cellW / 2;
          // Couleur interpolée entre excited et excitedCore selon le niveau
          ctx.globalAlpha = 0.25 + lv * 0.75;
          ctx.fillStyle = lv > 0.6 ? theme.excitedCore : theme.excited;
          ctx.shadowBlur = lv > 0.15 ? 10 * lv : 0;
          ctx.shadowColor = theme.excited;
          ctx.fillRect(x - bw / 2, h / 2 - barH / 2, bw, barH);
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [theme.excited, theme.excitedCore, theme.rest]);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/25 p-3 backdrop-blur-sm">
        <canvas ref={canvasRef} className="h-20 w-full" aria-hidden />
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={flash}
          className="rounded-lg border border-white/15 px-4 py-1.5 font-mono text-[13px] text-white/80 transition hover:bg-white/[0.06] hover:text-white active:scale-95"
        >
          flasher
        </button>
      </div>
    </div>
  );
}
