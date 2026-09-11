"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Box, MousePointerClick, Orbit, Square } from "lucide-react";
import { Header, type AppMode } from "@/components/Header";
import { ControlPanel } from "@/components/ControlPanel";
import { StatsPanel } from "@/components/StatsPanel";
import { ScaleMode } from "@/components/ScaleMode";
import { OrganismeMode } from "@/components/OrganismeMode";
import { useSimulation } from "@/hooks/useSimulation";
import { useTheme } from "@/hooks/useTheme";
import { setAudioEnabled } from "@/lib/audio";

const graphLoader = () => (
  <div className="flex h-full w-full items-center justify-center">
    <div className="flex items-center gap-2 font-mono text-sm text-white/40">
      <span className="h-2 w-2 animate-ping rounded-full" style={{ background: "var(--a1)" }} />
      initialisation du réseau…
    </div>
  </div>
);

// react-force-graph dépend de window/canvas/WebGL → chargés uniquement côté client.
const NeuralGraph = dynamic(() => import("@/components/NeuralGraph"), {
  ssr: false,
  loading: graphLoader,
});
const NeuralGraph3D = dynamic(() => import("@/components/NeuralGraph3D"), {
  ssr: false,
  loading: graphLoader,
});
// Le mode « Vie » tourne dans un worker + WebGL : client uniquement.
const VieMode = dynamic(() => import("@/components/vie/VieMode"), {
  ssr: false,
  loading: graphLoader,
});

type ViewMode = "2d" | "3d";

export function MyelineApp() {
  const sim = useSimulation();
  const { themeId, setThemeId, theme } = useTheme();
  const [audioOn, setAudioOn] = useState(false);
  const [manualFit, setManualFit] = useState(0);
  const [brushMode, setBrushMode] = useState(false);
  const [view, setView] = useState<ViewMode>("2d");
  const [mode, setMode] = useState<AppMode>("vie");

  const fit = useCallback(() => setManualFit((n) => n + 1), []);

  const toggleAudio = useCallback((value: boolean) => {
    setAudioOn(value);
    setAudioEnabled(value);
  }, []);

  // Raccourcis clavier (mode Studio) : Espace, S, R, F.
  const { toggleRun, stepOnce, reset, running } = sim;
  useEffect(() => {
    if (mode !== "studio") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [role="slider"], [data-slot="slider"]')) {
        return;
      }
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
  }, [mode, toggleRun, stepOnce, reset, running, fit]);

  return (
    <div
      data-theme={themeId}
      style={theme.vars as React.CSSProperties}
      className="myeline-bg flex min-h-screen flex-col text-white lg:h-screen lg:overflow-hidden"
    >
      <Header
        themeId={themeId}
        onThemeChange={setThemeId}
        mode={mode}
        onModeChange={setMode}
      />
      {mode === "vie" ? (
        <VieMode />
      ) : mode === "scale" ? (
        <ScaleMode theme={theme} />
      ) : mode === "organisme" ? (
        <OrganismeMode theme={theme} />
      ) : (
      <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        <aside className="order-2 w-full shrink-0 border-white/[0.06] p-4 lg:order-1 lg:w-[300px] lg:overflow-y-auto lg:border-r">
          <ControlPanel
            sim={sim}
            audioOn={audioOn}
            onToggleAudio={toggleAudio}
            onFit={fit}
            brushMode={brushMode}
            onToggleBrush={setBrushMode}
          />
        </aside>

        <section className="myeline-stage relative order-1 min-h-[52vh] flex-1 lg:order-2">
          {view === "2d" ? (
            <NeuralGraph
              graphData={sim.graphData}
              onExcite={sim.exciteNode}
              brushMode={brushMode}
              fitToken={sim.buildNonce + manualFit}
              droppedEdges={sim.getDroppedEdges}
              theme={theme.canvas}
            />
          ) : (
            <NeuralGraph3D
              graphData={sim.graphData}
              onExcite={sim.exciteNode}
              brushMode={brushMode}
              fitToken={sim.buildNonce + manualFit}
              theme={theme.canvas}
            />
          )}

          {/* Bascule 2D / 3D */}
          <div className="absolute top-3 left-3 flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/40 p-0.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setView("2d")}
              aria-pressed={view === "2d"}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[11px] transition ${
                view === "2d" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
              }`}
            >
              <Square size={12} />
              2D
            </button>
            <button
              type="button"
              onClick={() => setView("3d")}
              aria-pressed={view === "3d"}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[11px] transition ${
                view === "3d" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
              }`}
            >
              <Box size={12} />
              3D
            </button>
          </div>

          {/* Légende des phases */}
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5 font-mono text-[11px] text-white/50">
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--a1)", boxShadow: "0 0 8px 2px color-mix(in srgb, var(--a1) 60%, transparent)" }}
              />
              excité
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--a2)" }} />
              réfractaire
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
              repos
            </span>
          </div>

          {/* Astuce */}
          <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1.5 font-mono text-[11px] text-white/35">
            {view === "3d" ? <Orbit size={13} /> : <MousePointerClick size={13} />}
            {view === "3d"
              ? "glisser = orbiter · molette = zoom · clic = décharger"
              : brushMode
                ? "pinceau : survole pour stimuler"
                : "clic = décharger un neurone"}
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
      )}
    </div>
  );
}
