"use client";

// Mode « Créature » — la boucle sensori-motrice APPRISE rendue visible (v1, panneau 1).
// Honnêteté affichée : 1 essai = 1 décision récompensée (sense+act+credit au même tick) ;
// le déplacement anime le résultat. Preuve d'apprentissage = la DIVERGENCE des poids
// SENS→B (approcher) vs SENS→C, PAS la croissance structurelle (graphe figé).

import { Gauge, Pause, Play, RotateCcw, StepForward, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CreatureWorld } from "@/components/CreatureWorld";
import { useCreature } from "@/hooks/useCreature";
import type { Theme } from "@/lib/themes";

const W_FULL = 56; // wB max ≈ W_CAP(14) × 4 arêtes SENS→pool

function coerce(v: number | number[] | readonly number[]): number {
  return Array.isArray(v) ? v[0] : (v as number);
}

interface Props {
  theme: Theme;
}

export function CreatureMode({ theme }: Props) {
  const c = useCreature();
  const { stats } = c;
  const conf = Math.round(stats.confidence * 100);

  return (
    <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
      <aside className="order-2 w-full shrink-0 border-white/[0.06] p-4 lg:order-1 lg:w-[300px] lg:overflow-y-auto lg:border-r">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-md">
            <h3 className="mb-3 text-[11px] font-medium tracking-wider text-white/40 uppercase">
              Créature
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={c.running ? "secondary" : "default"}
                onClick={c.toggleRun}
                className={c.running ? "" : "shadow-[0_0_22px_-6px_var(--a1)]"}
              >
                {c.running ? <Pause /> : <Play />}
                {c.running ? "Pause" : "Lancer"}
              </Button>
              <Button variant="outline" onClick={c.stepOnce} disabled={c.running}>
                <StepForward />
                Un essai
              </Button>
              <Button variant="ghost" onClick={c.reset} className="col-span-2">
                <RotateCcw />
                Nouvelle créature
              </Button>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span className="flex items-center gap-1.5">
                  <Gauge size={13} className="text-[var(--a1)]" />
                  Vitesse
                </span>
                <span className="font-mono text-white/90">{c.speed} essais/s</span>
              </div>
              <Slider
                className="mt-2"
                value={[c.speed]}
                min={1}
                max={30}
                onValueChange={(v) => c.setSpeed(coerce(v))}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 text-xs leading-relaxed text-white/55 backdrop-blur-md">
            <p>
              <span className="text-white/80">Tâche operante.</span> La créature sent la
              pastille, choisit <span className="text-[var(--a1)]">approcher</span> ou une
              mauvaise direction, et n&apos;est récompensée que pour l&apos;approche.
            </p>
            <p className="mt-2 text-white/40">
              1 essai = 1 décision récompensée (même tick). Le déplacement anime le
              résultat — il ne pilote pas la récompense.
            </p>
          </div>
        </div>
      </aside>

      <section className="myeline-stage relative order-1 min-h-[52vh] flex-1 lg:order-2">
        <CreatureWorld worldRef={c.worldRef} version={c.version} theme={theme.canvas} />
        <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-[11px] text-white/35">
          essai {stats.trial.toLocaleString("fr-FR")} · {stats.eaten} pastille
          {stats.eaten > 1 ? "s" : ""} atteinte{stats.eaten > 1 ? "s" : ""}
        </div>
      </section>

      <aside className="order-3 w-full shrink-0 border-white/[0.06] p-4 lg:w-[320px] lg:overflow-y-auto lg:border-l">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-md">
          <h3 className="mb-3 text-[11px] font-medium tracking-wider text-white/40 uppercase">
            Preuve d&apos;apprentissage
          </h3>

          <div className="mb-1 flex items-center justify-between text-xs text-white/70">
            <span className="flex items-center gap-1.5">
              <Target size={13} className="text-[var(--a1)]" />
              P(approche)
            </span>
            <span className="font-mono text-white/90">{conf}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full transition-[width] duration-200"
              style={{ width: `${conf}%`, background: "var(--a1)" }}
            />
          </div>

          <div className="mt-4 space-y-2">
            <WeightBar label="poids SENS → approcher (B)" value={stats.wB} accent="var(--a1)" />
            <WeightBar label="poids SENS → mauvais (C)" value={stats.wC} accent="var(--a3)" />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/40">
            La voie <span className="text-[var(--a1)]">approcher</span> se renforce, la voie{" "}
            <span className="text-[var(--a3)]">mauvaise</span> reste plate : c&apos;est la
            divergence des poids qui EST l&apos;apprentissage (le graphe, lui, est figé).
          </p>
        </div>
      </aside>
    </main>
  );
}

function WeightBar({ label, value, accent }: { label: string; value: number; accent: string }) {
  const pct = Math.max(0, Math.min(100, (value / W_FULL) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-white/55">
        <span>{label}</span>
        <span className="font-mono text-white/80">{value.toFixed(1)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-[width] duration-200"
          style={{ width: `${pct}%`, background: accent }}
        />
      </div>
    </div>
  );
}
