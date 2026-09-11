"use client";

// Mode « Vie » — le lot 2 : le nouvel organisme (src/sim) devient visible.
// Cerveau 3D à gauche (50 000 neurones, un point chacun), monde 2D et course au
// seuil à droite, contrôles dans l'aside. Tout tourne dans un worker ; cette page
// ne reçoit que des images transférées.

import dynamic from "next/dynamic";
import { useState } from "react";
import { Gauge, GitBranch, Pause, Play, RotateCcw, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import WorldView from "@/components/vie/WorldView";
import DecisionBars from "@/components/vie/DecisionBars";
import { useOrganismSim } from "@/hooks/useOrganismSim";

const BrainView = dynamic(() => import("@/components/vie/BrainView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center font-mono text-sm text-white/40">
      initialisation du cerveau…
    </div>
  ),
});

const TAILLES = [12_000, 25_000, 50_000];

function coerce(v: number | number[] | readonly number[]): number {
  return Array.isArray(v) ? v[0] : (v as number);
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n}`;
}

function fmtOpt(n: number): string {
  return Number.isNaN(n) ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(1);
}

export default function VieMode() {
  const sim = useOrganismSim();
  const [showEdges, setShowEdges] = useState(false);
  const s = sim.stats;

  const basculerAretes = () => {
    if (!showEdges && sim.edges === null) sim.requestEdges();
    setShowEdges((v) => !v);
  };

  return (
    <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
      <aside className="order-2 w-full shrink-0 border-white/[0.06] p-4 lg:order-1 lg:w-[300px] lg:overflow-y-auto lg:border-r">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-md">
            <h3 className="mb-3 text-[11px] font-medium tracking-wider text-white/40 uppercase">
              Vie
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={sim.running ? "secondary" : "default"}
                onClick={sim.toggleRun}
                disabled={!sim.ready}
                className={sim.running ? "" : "shadow-[0_0_22px_-6px_var(--a1)]"}
              >
                {sim.running ? <Pause /> : <Play />}
                {sim.running ? "Pause" : "Lancer"}
              </Button>
              <Button variant="outline" onClick={() => sim.regenerate()} disabled={!sim.ready}>
                <RotateCcw />
                Régénérer
              </Button>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span className="flex items-center gap-1.5">
                  <Gauge size={13} className="text-[var(--a1)]" />
                  Cadence
                </span>
                <span className="font-mono text-white/90">
                  {s ? `${Math.round(s.measuredTps)} ticks/s` : `${sim.speed} ticks/s`}
                </span>
              </div>
              <Slider
                className="mt-2"
                value={[sim.speed]}
                min={30}
                max={600}
                step={10}
                onValueChange={(v) => sim.setSpeed(coerce(v))}
              />
              <p className="mt-1 text-[10px] text-white/30">
                demandée {sim.speed} — affichée : mesurée
              </p>
            </div>
            <div className="mt-3">
              <div className="mb-1.5 text-xs text-white/70">Taille du réseau</div>
              <div className="grid grid-cols-3 gap-1.5">
                {TAILLES.map((n) => (
                  <Button
                    key={n}
                    variant={sim.size === n ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => sim.regenerate(n)}
                  >
                    {fmt(n)}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              variant={showEdges ? "secondary" : "ghost"}
              size="sm"
              className="mt-3 w-full"
              onClick={basculerAretes}
              disabled={!sim.ready}
            >
              <GitBranch size={13} />
              {showEdges ? "Masquer les arêtes" : "Montrer les arêtes"}
            </Button>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-md">
            <h3 className="mb-3 text-[11px] font-medium tracking-wider text-white/40 uppercase">
              Organisme
            </h3>
            <div className="grid grid-cols-2 gap-3 font-mono">
              <Stat label="ticks" value={s ? s.t.toLocaleString("fr-FR") : "—"} />
              <Stat label="vies closes" value={s ? `${s.deaths}` : "—"} />
              <Stat label="vie médiane" value={s ? fmtOpt(s.lifetimeMedian) : "—"} />
              <Stat label="énergie moy." value={s ? fmtOpt(s.energyMean) : "—"} />
              <Stat label="nourri / toxine" value={s ? `${s.ateFood} / ${s.ateToxin}` : "—"} />
              <Stat label="prédateur" value={s ? `${s.hits}` : "—"} />
              <Stat label="décision" value={s?.lastAction ?? "—"} accent />
              <Stat label="dopamine" value={s ? s.da.toFixed(2) : "—"} />
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.03] p-3.5 backdrop-blur-md">
            <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-emerald-200/70 uppercase">
              <Wind size={12} />
              Voie olfactive — apprise
            </h3>
            <div className="grid grid-cols-2 gap-3 font-mono">
              <Stat
                label="odeur dominante"
                value={
                  s?.voie ? (s.voie.odeur === 1 ? "nourriture" : s.voie.odeur === 2 ? "toxine" : "—") : "—"
                }
              />
              <Stat
                label="mbon / ser"
                value={s?.voie ? `${s.voie.mbon.toFixed(2)} / ${s.voie.ser.toFixed(2)}` : "—"}
              />
              <Stat
                label="w approche ← nourriture"
                value={s?.voie ? s.voie.wMbonFood.toFixed(2) : "—"}
                accent
              />
              <Stat
                label="w évitement ← toxine"
                value={s?.voie ? s.voie.wSerToxin.toFixed(2) : "—"}
                accent
              />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-white/35">
              Les poids croissent en direct quand l&apos;odeur annonce la conséquence —
              approche pour la nourriture, évitement pour la toxine.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 text-[11px] leading-relaxed text-white/50 backdrop-blur-md">
            <span className="text-white/80">Ce qui est mesuré.</span> Activité, décisions,
            énergie, vies — tout vient du réseau tourant dans un worker.{" "}
            <span className="text-white/80">L&apos;apprentissage est actif :</span>{" "}
            la voie olfactive apprend les odeurs du monde en direct (rang 5 — porte
            `_voie-monde.probe.test.ts` : évitement toxine ×0,3–0,6, dissociation des
            lésions, inversion et extinction ré-apprises).
          </div>
        </div>
      </aside>

      <section className="order-1 flex min-h-[52vh] flex-1 flex-col lg:order-2 lg:min-h-0 lg:flex-row">
        <div className="myeline-stage relative min-h-[46vh] flex-1 lg:min-h-0 lg:border-r lg:border-white/[0.06]">
          {sim.ready && sim.positions ? (
            <BrainView
              positions={sim.positions}
              regions={sim.regions}
              activityRef={sim.activityRef}
              edges={sim.edges}
              showEdges={showEdges}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-mono text-sm text-white/40">
              construction du réseau ({fmt(sim.size)} neurones)…
            </div>
          )}
          <Tag>
            Cerveau — {fmt(sim.size)} neurones, {fmt(sim.e)} arêtes · voie olfactive en
            surimpression
          </Tag>
        </div>
        <div className="flex min-h-[46vh] flex-col lg:w-[340px] lg:min-h-0 lg:shrink-0">
          <div className="myeline-stage relative min-h-[260px] flex-1 border-b border-white/[0.06]">
            <WorldView snapRef={sim.snapRef} />
            <Tag>Monde — fourrage, toxine, prédateur</Tag>
          </div>
          <div className="p-3">
            <div className="mb-2 text-[10px] font-medium tracking-wider text-white/40 uppercase">
              Décision — la course au seuil
            </div>
            <DecisionBars snapRef={sim.snapRef} />
            <p className="mt-2 text-[10px] leading-relaxed text-white/30">
              Chaque barre accumule les décharges d&apos;un pool moteur ; la première à
              franchir le seuil décide.
            </p>
          </div>
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
