"use client";

// Mode « Organisme » — la créature à RÉSERVOIR, vue scindée : à gauche le SUJET-TEST qui
// fourrage (corps 4 membres), à droite son CERVEAU (le réservoir live, NeuralPointCloud,
// réagissant aux capteurs). Les deux lisent le même organisme (hook partagé). Honnêteté
// affichée : réservoir + politique apprise = réel ; corps + locomotion = scène codée.

import dynamic from "next/dynamic";
import { Gauge, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ReservoirCreatureView } from "@/components/ReservoirCreatureView";
import { useReservoirCreature } from "@/hooks/useReservoirCreature";
import type { Theme } from "@/lib/themes";

const NeuralPointCloud = dynamic(() => import("@/components/NeuralPointCloud"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center font-mono text-sm text-white/40">
      initialisation du cerveau…
    </div>
  ),
});

const ACTIONS = ["tourner ←", "tourner →", "avancer"];

function coerce(v: number | number[] | readonly number[]): number {
  return Array.isArray(v) ? v[0] : (v as number);
}

export function OrganismeMode({ theme }: { theme: Theme }) {
  const o = useReservoirCreature();
  const { stats } = o;

  return (
    <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
      <aside className="order-2 w-full shrink-0 border-white/[0.06] p-4 lg:order-1 lg:w-[300px] lg:overflow-y-auto lg:border-r">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-md">
            <h3 className="mb-3 text-[11px] font-medium tracking-wider text-white/40 uppercase">
              Organisme
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={o.running ? "secondary" : "default"}
                onClick={o.toggleRun}
                className={o.running ? "" : "shadow-[0_0_22px_-6px_var(--a1)]"}
              >
                {o.running ? <Pause /> : <Play />}
                {o.running ? "Pause" : "Lancer"}
              </Button>
              <Button variant="ghost" onClick={o.reset}>
                <RotateCcw />
                Nouvel organisme
              </Button>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span className="flex items-center gap-1.5">
                  <Gauge size={13} className="text-[var(--a1)]" />
                  Vitesse
                </span>
                <span className="font-mono text-white/90">{o.speed} ticks/s</span>
              </div>
              <Slider
                className="mt-2"
                value={[o.speed]}
                min={1}
                max={40}
                onValueChange={(v) => o.setSpeed(coerce(v))}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-md">
            <h3 className="mb-3 text-[11px] font-medium tracking-wider text-white/40 uppercase">
              Fourrage
            </h3>
            <div className="grid grid-cols-2 gap-3 font-mono">
              <Stat label="mangé" value={`${stats.eaten}`} />
              <Stat label="ticks" value={stats.t.toLocaleString("fr-FR")} />
              <Stat label="taux /500" value={`${stats.ratePer500}`} accent />
              <Stat label="action" value={ACTIONS[stats.lastAction] ?? "—"} />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-white/40">
              Le <span className="text-[var(--a1)]">taux /500</span> monte = l&apos;organisme
              apprend à fourrager (récompense → readout). Le réservoir, lui, est figé.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 text-[11px] leading-relaxed text-white/50 backdrop-blur-md">
            <span className="text-white/80">Plafond honnête.</span> Réel = l&apos;activité du
            réservoir (à droite) + la politique apprise par récompense. Scène codée = le corps,
            les membres, la locomotion.
          </div>
        </div>
      </aside>

      <section className="order-1 flex min-h-[52vh] flex-1 flex-col lg:order-2 lg:min-h-0 lg:flex-row">
        <div className="myeline-stage relative min-h-[40vh] flex-1 lg:min-h-0 lg:border-r lg:border-white/[0.06]">
          <ReservoirCreatureView worldRef={o.worldRef} version={o.version} theme={theme.canvas} />
          <Tag>Créature — le sujet-test fourrage</Tag>
        </div>
        <div className="myeline-stage relative min-h-[40vh] flex-1 lg:min-h-0">
          <NeuralPointCloud
            graphRef={o.graphRef}
            version={o.version}
            fitToken={o.version}
            theme={theme.canvas}
            onExcite={() => {}}
          />
          <Tag>Échelle — le cerveau-réservoir, en direct</Tag>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] tracking-wider text-white/40 uppercase">{label}</div>
      <div className={`text-lg ${accent ? "text-[var(--a1)]" : "text-white/90"}`}>{value}</div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-3 left-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white/60 backdrop-blur-md">
      {children}
    </div>
  );
}
