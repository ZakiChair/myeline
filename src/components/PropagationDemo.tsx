"use client";

// Démo interactive de propagation : un milieu excitable (petite grille) où l'on
// avance itération par itération. Montre concrètement (1) le pas de temps discret
// et (2) la règle de propagation : un neurone au repos décharge dès qu'un voisin
// est excité, puis passe en période réfractaire. Mêmes règles que le simulateur.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, StepForward } from "lucide-react";

interface Props {
  excited: string;
  refractory: string;
  rest: string;
  accent: string;
}

const COLS = 29;
const ROWS = 15;
const REFRACTORY = 4; // ticks réfractaires
const STEP_MS = 620;
const CENTER = Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2);

// État d'une cellule : 0 = repos, 1 = excité, 2..(REFRACTORY+1) = réfractaire.
function makeGrid(): number[] {
  const g = new Array<number>(COLS * ROWS).fill(0);
  g[CENTER] = 1;
  return g;
}

function isDormant(grid: number[]): boolean {
  for (const s of grid) if (s !== 0) return false;
  return true;
}

function nextGrid(grid: number[]): number[] {
  const next = new Array<number>(COLS * ROWS).fill(0);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      const s = grid[i];
      if (s === 1) {
        next[i] = 2; // excité → début de réfractaire
      } else if (s >= 2) {
        next[i] = s >= REFRACTORY + 1 ? 0 : s + 1;
      } else {
        // repos : décharge si au moins un voisin (von Neumann) est excité.
        let excitedNeighbors = 0;
        if (x > 0 && grid[i - 1] === 1) excitedNeighbors++;
        if (x < COLS - 1 && grid[i + 1] === 1) excitedNeighbors++;
        if (y > 0 && grid[i - COLS] === 1) excitedNeighbors++;
        if (y < ROWS - 1 && grid[i + COLS] === 1) excitedNeighbors++;
        next[i] = excitedNeighbors >= 1 ? 1 : 0;
      }
    }
  }
  return next;
}

export function PropagationDemo({ excited, refractory, rest, accent }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<number[]>(makeGrid());
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const tRef = useRef(0);

  const step = useCallback(() => {
    if (isDormant(gridRef.current)) {
      gridRef.current = makeGrid();
      tRef.current = 0;
      setT(0);
      return;
    }
    gridRef.current = nextGrid(gridRef.current);
    tRef.current += 1;
    setT(tRef.current);
  }, []);

  const reset = useCallback(() => {
    gridRef.current = makeGrid();
    tRef.current = 0;
    setT(0);
  }, []);

  // Avance automatique.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(step, STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, step]);

  // Boucle de rendu (toujours active : pulsation des excités).
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
      const now = performance.now();
      const r = canvas.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      ctx.clearRect(0, 0, w, h);
      const cellW = w / COLS;
      const cellH = h / ROWS;
      const grid = gridRef.current;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const s = grid[y * COLS + x];
          const cx = x * cellW + cellW / 2;
          const cy = y * cellH + cellH / 2;
          const base = Math.min(cellW, cellH) * 0.42;
          let color: string;
          let radius: number;
          let alpha: number;
          let glow = false;
          if (s === 1) {
            color = excited;
            radius = base * (1 + 0.12 * Math.sin(now / 220));
            alpha = 1;
            glow = true;
          } else if (s >= 2) {
            color = refractory;
            const k = (s - 1) / (REFRACTORY + 1);
            radius = base * (0.78 - k * 0.2);
            alpha = 1 - k * 0.55;
          } else {
            color = rest;
            radius = base * 0.42;
            alpha = 0.4;
          }
          ctx.globalAlpha = alpha;
          ctx.shadowBlur = glow ? 14 : 0;
          ctx.shadowColor = glow ? excited : "transparent";
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
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
  }, [excited, refractory, rest]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] tracking-wide text-white/40 uppercase">
            itération
          </span>
          <span className="font-mono text-lg font-semibold tabular-nums text-white">
            t = {t}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause" : "Lecture"}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button
            type="button"
            onClick={step}
            disabled={playing}
            aria-label="Pas suivant"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            <StepForward size={13} />
          </button>
          <button
            type="button"
            onClick={reset}
            aria-label="Réinitialiser"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      <canvas ref={canvasRef} className="block h-[230px] w-full" aria-hidden />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] px-3 py-2 font-mono text-[10.5px] text-white/45">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: excited }} /> excité
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: refractory }} /> réfractaire
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: rest, opacity: 0.5 }} /> repos
        </span>
        <span className="ml-auto" style={{ color: accent }}>
          un voisin excité suffit à déclencher la décharge
        </span>
      </div>
    </div>
  );
}
