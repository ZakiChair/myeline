"use client";

// Onglet « Créature » de l'organisme à réservoir : rendu du SUJET-TEST — corps + tête + yeux
// + 4 membres animés (démarche codée) — dans son arène, avec la pastille, la trajectoire et le
// flash de récompense. Lit la ref du monde chaque frame (mutée par le hook). Le corps et la
// démarche sont de la SCÈNE codée ; ce qui est appris vit dans le réservoir (onglet Échelle).

import { useEffect, useRef, type RefObject } from "react";
import { ARENA, type CreatureWorld } from "@/lib/reservoir-creature";
import type { ThemeCanvas } from "@/lib/themes";

interface Props {
  worldRef: RefObject<CreatureWorld | null>;
  version: number;
  theme: ThemeCanvas;
}

const LEGS = [
  { hx: 6, hy: 6, off: 0 }, // avant-droit
  { hx: 6, hy: -6, off: Math.PI }, // avant-gauche
  { hx: -6, hy: 6, off: Math.PI }, // arrière-droit
  { hx: -6, hy: -6, off: 0 }, // arrière-gauche
];

export function ReservoirCreatureView({ worldRef, version, theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let frame = 0;
    let gait = 0;
    let flash = 0;
    let lastT = -1;
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
      const w = worldRef.current;
      if (!w) return;

      const pad = 28;
      const size = Math.max(40, Math.min(W, H) - pad * 2);
      const ox = (W - size) / 2;
      const oy = (H - size) / 2;
      const sx = (x: number) => ox + ((x + ARENA) / (2 * ARENA)) * size;
      const sy = (y: number) => oy + ((y + ARENA) / (2 * ARENA)) * size;

      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.roundRect(ox, oy, size, size, 16);
      ctx.stroke();

      // Démarche : la phase avance, plus vite quand la créature avance (action 2).
      gait += 0.16 + (w.lastAction === 2 ? 0.34 : 0);
      if (w.t !== lastT) {
        lastT = w.t;
        if (w.lastReward >= 1) flash = 1; // a mangé
      }
      flash *= 0.9;

      // Trajectoire.
      const tr = w.trail;
      for (let i = 1; i < tr.length; i++) {
        ctx.strokeStyle = withAlpha(theme.linkActive, (i / tr.length) * 0.6);
        ctx.lineWidth = 1 + (i / tr.length) * 1.3;
        ctx.beginPath();
        ctx.moveTo(sx(tr[i - 1].x), sy(tr[i - 1].y));
        ctx.lineTo(sx(tr[i].x), sy(tr[i].y));
        ctx.stroke();
      }

      // Pastille (halo pulsé).
      const pr = 6 * (1 + 0.18 * Math.sin(frame * 0.08));
      ctx.save();
      ctx.shadowColor = theme.event;
      ctx.shadowBlur = 18;
      ctx.fillStyle = theme.event;
      ctx.beginPath();
      ctx.arc(sx(w.foodX), sy(w.foodY), pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Le sujet-test : corps + tête + 4 membres animés.
      const cx = sx(w.x);
      const cy = sy(w.y);
      if (flash > 0.02) {
        ctx.strokeStyle = withAlpha(theme.event, flash * 0.7);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 16 + (1 - flash) * 26, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(w.heading);

      // Membres (sous le corps).
      ctx.strokeStyle = withAlpha(theme.excited, 0.85);
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      for (const leg of LEGS) {
        const stride = 4 * Math.sin(gait + leg.off);
        ctx.beginPath();
        ctx.moveTo(leg.hx, leg.hy);
        ctx.lineTo(leg.hx + stride, leg.hy + (leg.hy > 0 ? 7 : -7));
        ctx.stroke();
      }

      // Corps (ellipse) + glow.
      ctx.shadowColor = theme.excited;
      ctx.shadowBlur = 14;
      ctx.fillStyle = theme.excited;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tête (à l'avant) + yeux.
      ctx.beginPath();
      ctx.arc(11, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = theme.excitedCore;
      ctx.beginPath();
      ctx.arc(13, -2.2, 1.6, 0, Math.PI * 2);
      ctx.arc(13, 2.2, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [worldRef, theme, version]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
