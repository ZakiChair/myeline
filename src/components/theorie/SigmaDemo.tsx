"use client";

// Démonstration illustrative du ratio de branchement σ (modèle jouet Galton–Watson visuel).
// Le slider pilote σ : sous-critique (s'éteint), critique (se propage), super-critique (sature).
// NOTE : σ n'est pas mesuré ici — c'est une illustration pédagogique uniquement.

import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import type { ThemeCanvas } from "@/lib/themes";

// ── Paramètres du modèle ──────────────────────────────────────────────────────

/** Taille de la grille carrée (nœuds = GRID*GRID). */
const GRID = 24;
/** Délai entre deux pas de simulation (ms). */
const STEP_MS = 120;
/** Population maximale — plafond visuel en régime super-critique. */
const MAX_POP = Math.floor(GRID * GRID * 0.85);
/** Délai (en ticks) avant de re-semer une avalanche morte ou saturée. */
const RESEED_TICKS = 8;

// ── Helpers visuels ──────────────────────────────────────────────────────────

/** Rayon d'un nœud en pixels (calculé à l'affichage). */
function nodeRadius(cellSize: number) {
  return Math.max(2, cellSize * 0.32);
}

// ── Composant ────────────────────────────────────────────────────────────────

export function SigmaDemo({ theme }: { theme: ThemeCanvas }) {
  // σ affiché dans l'UI — état React pour re-rendu du label
  const [sigma, setSigma] = useState(1.0);
  // σ lu dans la boucle RAF — ref pour éviter de détruire/recréer la boucle à chaque drag
  const sigmaRef = useRef(1.0);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Thème en ref pour accès dans la boucle sans redémarrage
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  // ── Boucle d'animation ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // État : ensemble des nœuds actifs (index linéaire i = row*GRID + col)
    let active = new Set<number>();
    let raf = 0;
    let last = 0;
    let reseedCountdown = 0;

    // Semer une petite étincelle initiale
    const seed = () => {
      const cx = Math.floor(GRID / 2);
      const cy = Math.floor(GRID / 2);
      active = new Set([cy * GRID + cx]);
      reseedCountdown = 0;
    };
    seed();

    // ── Redimensionnement ────────────────────────────────────────────────────
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Un pas de Galton–Watson visuel ──────────────────────────────────────
    // Chaque nœud actif engendre en moyenne σ enfants parmi ses voisins libres.
    const step = () => {
      const σ = sigmaRef.current;
      const nextActive = new Set<number>();

      for (const idx of active) {
        const row = Math.floor(idx / GRID);
        const col = idx % GRID;

        // Voisins directs (4-connexité)
        const neighbors: number[] = [];
        if (row > 0) neighbors.push((row - 1) * GRID + col);
        if (row < GRID - 1) neighbors.push((row + 1) * GRID + col);
        if (col > 0) neighbors.push(row * GRID + (col - 1));
        if (col < GRID - 1) neighbors.push(row * GRID + (col + 1));

        // Chaque voisin libre est activé avec probabilité σ/4
        // → espérance de σ enfants par nœud (max 4 voisins)
        const p = Math.min(1, σ / 4);
        for (const nb of neighbors) {
          if (!active.has(nb) && Math.random() < p) {
            nextActive.add(nb);
          }
        }
      }

      // Plafonner la population pour le régime super-critique
      if (nextActive.size > MAX_POP) {
        const arr = Array.from(nextActive);
        active = new Set(arr.slice(0, MAX_POP));
      } else {
        active = nextActive;
      }

      // Re-semer si l'avalanche est morte ou saturée
      if (active.size === 0 || active.size >= MAX_POP) {
        if (reseedCountdown === 0) {
          reseedCountdown = RESEED_TICKS;
        } else {
          reseedCountdown--;
          if (reseedCountdown === 0) seed();
        }
      }

    };

    // ── Dessin ───────────────────────────────────────────────────────────────
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);

      if (t - last > STEP_MS) {
        step();
        last = t;
      }

      const { excited, rest, event } = themeRef.current;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;

      ctx.clearRect(0, 0, W, H);

      const cellW = W / GRID;
      const cellH = H / GRID;
      const r = nodeRadius(Math.min(cellW, cellH));

      // Dessiner les nœuds inactifs (fond discret)
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = rest;
      for (let i = 0; i < GRID * GRID; i++) {
        if (!active.has(i)) {
          const col = i % GRID;
          const row = Math.floor(i / GRID);
          const x = col * cellW + cellW / 2;
          const y = row * cellH + cellH / 2;
          ctx.beginPath();
          ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Dessiner les nœuds actifs avec éclat
      if (active.size > 0) {
        const isSaturated = active.size >= MAX_POP * 0.9;
        // En super-critique saturé : couleur event ; sinon excited
        const nodeColor = isSaturated ? event : excited;

        ctx.shadowBlur = 10;
        ctx.shadowColor = nodeColor;
        ctx.fillStyle = nodeColor;

        for (const idx of active) {
          const col = idx % GRID;
          const row = Math.floor(idx / GRID);
          const x = col * cellW + cellW / 2;
          const y = row * cellH + cellH / 2;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.shadowBlur = 0;
      }
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);
  // Note : les couleurs du thème sont lues via themeRef, pas en deps — évite de
  // recréer la boucle RAF. Les champs de thème sont mis à jour via l'effect sur themeRef.

  // ── Libellé du régime ────────────────────────────────────────────────────────
  const regime =
    sigma < 0.95
      ? "sous-critique — l'avalanche s'éteint"
      : sigma > 1.05
        ? "super-critique — l'activité sature"
        : "≈ critique — l'avalanche se propage";

  // Couleur du label selon le régime
  const regimeColor =
    sigma < 0.95
      ? "text-white/40"
      : sigma > 1.05
        ? "text-white/70"
        : "text-[var(--a1)]";

  return (
    <div className="flex flex-col gap-3">
      {/* Curseur σ */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-white/50 shrink-0">σ =</span>
        <Slider
          className="flex-1"
          value={[sigma]}
          min={0.2}
          max={1.8}
          step={0.05}
          onValueChange={(v) => {
            const val = Array.isArray(v) ? v[0] : (v as number);
            sigmaRef.current = val;
            setSigma(val);
          }}
        />
        <span className="font-mono text-xs text-white/90 tabular-nums w-8 text-right">
          {sigma.toFixed(2)}
        </span>
      </div>

      {/* Label du régime */}
      <p className={`font-mono text-[11px] ${regimeColor} text-center`}>
        {regime}
      </p>

      {/* Canvas de visualisation */}
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/30">
        <canvas ref={canvasRef} className="h-40 w-full" aria-hidden />
      </div>

      {/* Légende honnêteté — obligatoire */}
      <p className="font-mono text-[11px] text-white/40 text-center">
        démonstration illustrative — σ n&apos;est pas mesuré ici
      </p>
    </div>
  );
}
