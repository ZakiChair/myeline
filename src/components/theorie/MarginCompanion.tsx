"use client";

// Compagnon de marge : une VRAIE créature à réservoir (reservoir-creature) vit dans une
// bande verticale fixe à droite et tente de rejoindre ta position de lecture. La nourriture
// est épinglée à chaque tick à la hauteur de défilement (progression du document) ; la
// créature la poursuit via sa politique apprise et s'améliore au fil de la session (learn=true).
// On réutilise le moteur tel quel (makeReservoirCreature / stepCreature) en ne surchargeant
// que world.foodX/foodY. Le corps et la démarche sont de la SCÈNE codée ; le réel = le modèle.

import { useEffect, useRef } from "react";
import {
  makeReservoirCreature,
  stepCreature,
  ARENA,
  type ReservoirCreature,
} from "@/lib/reservoir-creature";
import { randomSeed } from "@/lib/rng";
import type { ThemeCanvas } from "@/lib/themes";

const STEP_MS = 70; // ~14 Hz, comme l'onglet Organisme
const FOOD_Y_SPAN = ARENA * 0.9; // amplitude verticale de la cible

const LEGS = [
  { hx: 5, hy: 5, off: 0 },
  { hx: 5, hy: -5, off: Math.PI },
  { hx: -5, hy: 5, off: Math.PI },
  { hx: -5, hy: -5, off: 0 },
];

export function MarginCompanion({ theme }: { theme: ThemeCanvas }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const creatureRef = useRef<ReservoirCreature | null>(null);
  const progressRef = useRef(0); // 0 (haut) → 1 (bas) du document
  const themeRef = useRef(theme);

  // Garde la ref du thème à jour sans redémarrer les boucles.
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  // Boucle de simulation : rodage (la créature apprend à tendre vers une cible mobile),
  // puis chasse en direct ta position de lecture tout en continuant d'apprendre.
  useEffect(() => {
    const c = makeReservoirCreature(randomSeed(), true);
    creatureRef.current = c;
    let cancelled = false;
    let warmTimer = 0;
    let liveInterval = 0;

    const onScroll = () => {
      const h = document.documentElement;
      progressRef.current = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const startLive = () => {
      if (cancelled) return;
      liveInterval = window.setInterval(() => {
        if (document.hidden) return; // pause onglet caché (CPU)
        // « Tu es ici » : cible au centre de la bande, à la hauteur de lecture.
        c.world.foodX = 0;
        c.world.foodY = (progressRef.current * 2 - 1) * FOOD_Y_SPAN;
        stepCreature(c);
      }, STEP_MS);
    };

    // Rodage NON bloquant : sans entraînement (poids à 0), la politique est uniforme
    // (marche aléatoire). On l'entraîne d'abord à poursuivre une cible qui oscille, en
    // lots successifs (setTimeout 0), pour qu'elle sache déjà « aller vers » la nourriture.
    const WARMUP = 3000;
    const BATCH = 300;
    let warmed = 0;
    const warm = () => {
      if (cancelled) return;
      for (let i = 0; i < BATCH && warmed < WARMUP; i++, warmed++) {
        c.world.foodX = 0;
        c.world.foodY = Math.sin(warmed * 0.025) * FOOD_Y_SPAN;
        stepCreature(c);
      }
      if (warmed < WARMUP) warmTimer = window.setTimeout(warm, 0);
      else startLive();
    };
    warm();

    return () => {
      cancelled = true;
      clearTimeout(warmTimer);
      clearInterval(liveInterval);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Rendu (lit la ref du monde chaque frame).
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
      const c = creatureRef.current;
      if (!c) return;
      const w = c.world;
      const th = themeRef.current;

      const pad = 12;
      const sx = (x: number) => pad + ((x + ARENA) / (2 * ARENA)) * (W - 2 * pad);
      const sy = (y: number) => pad + ((y + ARENA) / (2 * ARENA)) * (H - 2 * pad);

      // Démarche : phase qui avance, plus vite quand la créature avance (action 2).
      gait += 0.16 + (w.lastAction === 2 ? 0.34 : 0);
      if (w.t !== lastT) {
        lastT = w.t;
        if (w.lastReward >= 1) flash = 1; // a rejoint la cible
      }
      flash *= 0.9;

      // Cible « tu es ici » (repère discret + halo pulsé).
      const fx = sx(w.foodX);
      const fy = sy(w.foodY);
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(frame * 0.08);
      ctx.strokeStyle = th.event;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(fx, fy, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Traînée.
      const tr = w.trail;
      for (let i = 1; i < tr.length; i++) {
        ctx.strokeStyle = withAlpha(th.linkActive, (i / tr.length) * 0.45);
        ctx.lineWidth = 0.6 + (i / tr.length) * 1;
        ctx.beginPath();
        ctx.moveTo(sx(tr[i - 1].x), sy(tr[i - 1].y));
        ctx.lineTo(sx(tr[i].x), sy(tr[i].y));
        ctx.stroke();
      }

      // Le sujet : corps + tête + pattes animées.
      const cx = sx(w.x);
      const cy = sy(w.y);
      if (flash > 0.02) {
        ctx.strokeStyle = withAlpha(th.event, flash * 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 11 + (1 - flash) * 16, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(w.heading);

      ctx.strokeStyle = withAlpha(th.excited, 0.85);
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      for (const leg of LEGS) {
        const stride = 3 * Math.sin(gait + leg.off);
        ctx.beginPath();
        ctx.moveTo(leg.hx, leg.hy);
        ctx.lineTo(leg.hx + stride, leg.hy + (leg.hy > 0 ? 5 : -5));
        ctx.stroke();
      }

      ctx.shadowColor = th.excited;
      ctx.shadowBlur = 12;
      ctx.fillStyle = th.excited;
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(8, 0, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = th.excitedCore;
      ctx.beginPath();
      ctx.arc(9.5, -1.7, 1.2, 0, Math.PI * 2);
      ctx.arc(9.5, 1.7, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      aria-label="Compagnon : vrai modèle reservoir-creature qui apprend à rejoindre ta position de lecture ; le corps est de la scène codée."
      className="pointer-events-none fixed right-0 top-0 bottom-0 z-30 hidden w-11 border-l border-white/[0.06] bg-black/10 backdrop-blur-[1px] lg:block"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
