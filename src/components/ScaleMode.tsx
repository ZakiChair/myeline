"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  Gauge,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  StepForward,
  Waves,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { StatsPanel } from "@/components/StatsPanel";
import { useScaleSimulation } from "@/hooks/useScaleSimulation";
import type { Theme } from "@/lib/themes";

const NeuralPointCloud = dynamic(() => import("@/components/NeuralPointCloud"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center font-mono text-sm text-white/40">
      initialisation du moteur GPU…
    </div>
  ),
});

const SIZES = [1000, 5000, 10000, 25000, 50000, 100000];

function fmt(n: number): string {
  return n >= 1000 ? `${n / 1000}K` : `${n}`;
}

function coerce(v: number | number[] | readonly number[]): number {
  return Array.isArray(v) ? v[0] : (v as number);
}

interface Props {
  theme: Theme;
}

export function ScaleMode({ theme }: Props) {
  const sim = useScaleSimulation();
  const [manualFit, setManualFit] = useState(0);
  const fit = useCallback(() => setManualFit((n) => n + 1), []);

  const { toggleRun, stepOnce, reset, running } = sim;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [role="slider"], [data-slot="slider"]')) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggleRun();
      } else if (e.key === "s" || e.key === "S") {
        if (!running) stepOnce();
      } else if (e.key === "r" || e.key === "R") {
        reset();
      } else if (e.key === "f" || e.key === "F") {
        fit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleRun, stepOnce, reset, running, fit]);

  return (
    <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
      <aside className="order-2 w-full shrink-0 border-white/[0.06] p-4 lg:order-1 lg:w-[300px] lg:overflow-y-auto lg:border-r">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-md">
            <h3 className="mb-3 text-[11px] font-medium tracking-wider text-white/40 uppercase">
              Simulation
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={sim.running ? "secondary" : "default"}
                onClick={sim.toggleRun}
                disabled={sim.building}
                className={sim.running ? "" : "shadow-[0_0_22px_-6px_var(--a1)]"}
              >
                {sim.running ? <Pause /> : <Play />}
                {sim.running ? "Pause" : "Lancer"}
              </Button>
              <Button variant="outline" onClick={sim.stepOnce} disabled={sim.running || sim.building}>
                <StepForward />
                Pas à pas
              </Button>
              <Button variant="ghost" onClick={sim.reset} disabled={sim.building}>
                <RotateCcw />
                Réinitialiser
              </Button>
              <Button variant="ghost" onClick={fit} disabled={sim.building}>
                <Maximize2 />
                Recentrer
              </Button>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span className="flex items-center gap-1.5">
                  <Gauge size={13} className="text-[var(--a1)]" />
                  Vitesse
                </span>
                <span className="font-mono text-white/90">{sim.speed} tick/s</span>
              </div>
              <Slider
                className="mt-2"
                value={[sim.speed]}
                min={1}
                max={20}
                onValueChange={(v) => sim.setSpeed(coerce(v))}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-md">
            <h3 className="mb-3 text-[11px] font-medium tracking-wider text-white/40 uppercase">
              Taille du réseau
            </h3>
            <div className="grid grid-cols-3 gap-1.5">
              {SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => sim.setSize(n)}
                  disabled={sim.building}
                  aria-pressed={sim.params.initialCount === n}
                  className={`rounded-lg border px-2 py-1.5 font-mono text-xs transition disabled:opacity-50 ${
                    sim.params.initialCount === n
                      ? "border-white/70 bg-white/10 text-white"
                      : "border-white/10 text-white/55 hover:border-white/30 hover:text-white"
                  }`}
                >
                  {fmt(n)}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={sim.regenerate}
              disabled={sim.building}
              className="mt-3 w-full text-[var(--a2)] hover:bg-white/5"
            >
              <Sparkles />
              Générer nouveau réseau
            </Button>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-md">
            <h3 className="mb-3 text-[11px] font-medium tracking-wider text-white/40 uppercase">
              Activité
            </h3>
            <div className="flex flex-col gap-3.5">
              <div>
                <div className="flex items-center justify-between text-xs text-white/70">
                  <span className="flex items-center gap-1.5">
                    <Waves size={13} className="text-[var(--a1)]" />
                    Seuil de décharge φ
                  </span>
                  <span className="font-mono text-white/90">
                    {Math.round(sim.params.fireFraction * 100)}%
                  </span>
                </div>
                <Slider
                  className="mt-2"
                  value={[Math.round(sim.params.fireFraction * 100)]}
                  min={5}
                  max={90}
                  onValueChange={(v) => sim.setLiveParam("fireFraction", coerce(v) / 100)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-white/70">
                  <span className="flex items-center gap-1.5">
                    <Zap size={13} className="text-[var(--a3)]" />
                    Étincelle spontanée
                  </span>
                  <span className="font-mono text-white/90">
                    {(sim.params.spontaneous * 100).toFixed(1)}%
                  </span>
                </div>
                <Slider
                  className="mt-2"
                  value={[Math.round(sim.params.spontaneous * 1000)]}
                  min={0}
                  max={50}
                  onValueChange={(v) => sim.setLiveParam("spontaneous", coerce(v) / 1000)}
                />
              </div>
            </div>
          </div>
        </div>
      </aside>

      <section className="myeline-stage relative order-1 min-h-[52vh] flex-1 lg:order-2">
        <NeuralPointCloud
          graphRef={sim.graphRef}
          version={sim.buildVersion}
          fitToken={sim.buildVersion + manualFit}
          theme={theme.canvas}
          onExcite={sim.exciteNode}
        />
        {sim.building && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 font-mono text-sm text-white/60 backdrop-blur-sm">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 animate-ping rounded-full" style={{ background: "var(--a1)" }} />
              construction du réseau ({sim.params.initialCount.toLocaleString("fr-FR")} neurones)…
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-[11px] text-white/35">
          glisser = orbiter · molette = zoom · clic = décharger
        </div>
      </section>

      <aside className="order-3 w-full shrink-0 border-white/[0.06] p-4 lg:w-[320px] lg:overflow-y-auto lg:border-l">
        <StatsPanel
          stats={sim.stats}
          history={sim.history}
          seed={sim.seed}
          running={sim.running}
          chartColors={theme.chart}
        />
      </aside>
    </main>
  );
}
