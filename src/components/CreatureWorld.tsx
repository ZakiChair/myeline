"use client";

// Panneau « LE MONDE » — rendu canvas 2D de l'arène : la créature orientée (un corps +
// deux yeux), la pastille, et la TRAÎNÉE qui révèle le passage du zigzag (B/C ~50/50) au
// beeline (B dominant) à mesure que la créature apprend. Lit la ref du monde chaque frame
// (l'objet est muté en place par le hook) ; un flash colore l'arène au tick récompensé.

import { useEffect, useRef, type RefObject } from "react";
import { ARENA, type CreatureState } from "@/lib/world";
import type { ThemeCanvas } from "@/lib/themes";

interface Props {
  worldRef: RefObject<CreatureState | null>;
  version: number;
  theme: ThemeCanvas;
}

export function CreatureWorld({ worldRef, version, theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let frame = 0;
    let flash = 0;
    let lastTrial = -1;
    let W = 0;
    let H = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = parent.clientWidth;
      H = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      frame++;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const world = worldRef.current;
      if (!world) return;

      const pad = 28;
      const size = Math.max(40, Math.min(W, H) - pad * 2);
      const ox = (W - size) / 2;
      const oy = (H - size) / 2;
      const sx = (x: number) => ox + ((x + ARENA) / (2 * ARENA)) * size;
      const sy = (y: number) => oy + ((y + ARENA) / (2 * ARENA)) * size;
      const sc = size / (2 * ARENA);

      // Bord de l'arène.
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.roundRect(ox, oy, size, size, 16);
      ctx.stroke();

      // Détection du flash récompense (nouvel essai récompensé).
      if (world.trial !== lastTrial) {
        lastTrial = world.trial;
        if (world.lastReward) flash = 1;
      }
      flash *= 0.9;

      // Traînée (ancien = plus pâle).
      const tr = world.trail;
      if (tr.length > 1) {
        for (let i = 1; i < tr.length; i++) {
          const a = (i / tr.length) * 0.7;
          ctx.strokeStyle = withAlpha(theme.linkActive, a);
          ctx.lineWidth = 1 + (i / tr.length) * 1.5;
          ctx.beginPath();
          ctx.moveTo(sx(tr[i - 1].x), sy(tr[i - 1].y));
          ctx.lineTo(sx(tr[i].x), sy(tr[i].y));
          ctx.stroke();
        }
      }

      // Pastille (pulsation lente + halo).
      const pulse = 1 + 0.18 * Math.sin(frame * 0.08);
      const pr = 6 * pulse;
      ctx.save();
      ctx.shadowColor = theme.event;
      ctx.shadowBlur = 18;
      ctx.fillStyle = theme.event;
      ctx.beginPath();
      ctx.arc(sx(world.pellet.x), sy(world.pellet.y), pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Flash de récompense (halo autour de la créature).
      const cx = sx(world.pos.x);
      const cy = sy(world.pos.y);
      if (flash > 0.02) {
        ctx.strokeStyle = withAlpha(theme.event, flash * 0.7);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 14 + (1 - flash) * 26, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Créature : corps orienté (triangle) + deux yeux.
      const r = 9;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(world.heading);
      ctx.shadowColor = theme.excited;
      ctx.shadowBlur = 14;
      ctx.fillStyle = theme.excited;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.7, r * 0.7);
      ctx.lineTo(-r * 0.7, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      // Yeux (à l'avant).
      ctx.shadowBlur = 0;
      ctx.fillStyle = theme.excitedCore;
      ctx.beginPath();
      ctx.arc(r * 0.2, -r * 0.32, 1.7, 0, Math.PI * 2);
      ctx.arc(r * 0.2, r * 0.32, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      void sc; // (réservé pour un éventuel rayon en unités-monde)
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [worldRef, theme, version]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

/** Applique une opacité à une couleur hex #rrggbb. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
