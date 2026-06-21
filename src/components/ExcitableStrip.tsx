"use client";

// Signature de la page Théorie : une ligne excitable 1D (Greenberg–Hastings) où
// des ondes d'activité se propagent — le mécanisme central, rendu vivant.

import { useEffect, useRef } from "react";

interface Props {
  excited: string;
  refractory: string;
  rest: string;
}

const N = 96;
const REFRACTORY = 4;
const STEP_MS = 85;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function ExcitableStrip({ excited, refractory, rest }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let state = new Array<number>(N).fill(0);
    let raf = 0;
    let last = 0;
    let tick = 0;

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

    const step = () => {
      const next = state.slice();
      for (let i = 0; i < N; i++) {
        const s = state[i];
        if (s === 1) next[i] = 2;
        else if (s >= 2) next[i] = s >= REFRACTORY + 1 ? 0 : s + 1;
        else {
          const left = state[(i - 1 + N) % N];
          const right = state[(i + 1) % N];
          next[i] = left === 1 || right === 1 ? 1 : 0;
        }
      }
      if (tick % 18 === 0) next[2] = 1; // onde principale
      if (tick % 43 === 21) next[N - 3] = 1; // contre-onde
      state = next;
      tick++;
    };

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last > STEP_MS) {
        step();
        last = t;
      }
      const r = canvas.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      ctx.clearRect(0, 0, w, h);
      const cellW = w / N;
      for (let i = 0; i < N; i++) {
        const s = state[i];
        let color: string;
        let alpha: number;
        let glow = false;
        let barH: number;
        if (s === 1) {
          color = excited;
          alpha = 1;
          glow = true;
          barH = h * 0.82;
        } else if (s >= 2) {
          color = refractory;
          alpha = 1 - ((s - 1) / (REFRACTORY + 1)) * 0.72;
          barH = h * 0.5;
        } else {
          color = rest;
          alpha = 0.25;
          barH = h * 0.16;
        }
        const x = i * cellW + cellW / 2;
        const bw = Math.max(1.5, cellW * 0.5);
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = glow ? 12 : 0;
        ctx.shadowColor = glow ? excited : "transparent";
        ctx.fillStyle = color;
        roundRect(ctx, x - bw / 2, h / 2 - barH / 2, bw, barH, bw / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [excited, refractory, rest]);

  return <canvas ref={canvasRef} className="h-16 w-full" aria-hidden />;
}
