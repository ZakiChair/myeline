"use client";

import { motion } from "framer-motion";
import { Activity, Dna, Link2, Radius } from "lucide-react";
import type { HistoryPoint, Stats } from "@/lib/types";
import { PopulationChart } from "@/components/PopulationChart";

interface Props {
  stats: Stats;
  history: HistoryPoint[];
  seed: number;
  running: boolean;
  chartColors: { total: string; excited: string };
}

function StatTile({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-white/40">
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-xl font-semibold tabular-nums text-white">
          {value}
        </span>
        {sub && <span className="font-mono text-xs text-white/40">{sub}</span>}
      </div>
    </div>
  );
}

/** Régime dynamique d'activité, lu directement par l'utilisateur. */
function regimeOf(stats: Stats): { label: string; tone: string } {
  if (stats.total === 0) return { label: "—", tone: "text-white/40 bg-white/5" };
  const pct = (stats.excited / stats.total) * 100;
  if (pct < 2) return { label: "silencieux", tone: "text-slate-300 bg-slate-400/10" };
  if (pct <= 42) return { label: "avalanches", tone: "text-[var(--a1)] bg-[color-mix(in_srgb,var(--a1)_14%,transparent)]" };
  return { label: "saturé", tone: "text-[var(--a3)] bg-[color-mix(in_srgb,var(--a3)_16%,transparent)]" };
}

export function StatsPanel({ stats, history, seed, running, chartColors }: Props) {
  const excitedPct = stats.total > 0 ? Math.round((stats.excited / stats.total) * 100) : 0;
  const total = Math.max(1, stats.total);
  const excW = (stats.excited / total) * 100;
  const refW = (stats.refractory / total) * 100;
  const restW = (stats.rest / total) * 100;
  const regime = regimeOf(stats);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="text-[11px] tracking-wide text-white/40 uppercase">Itération</span>
          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${regime.tone}`}>
            {regime.label}
          </span>
        </div>
        <div className="mt-1 flex items-end justify-between">
          <motion.div
            key={stats.generation}
            initial={{ opacity: 0.4, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="font-mono text-4xl font-bold tabular-nums text-white"
          >
            {stats.generation}
          </motion.div>
          <span
            className={`mb-1 flex items-center gap-1.5 font-mono text-[11px] ${
              running ? "text-[var(--a1)]" : "text-white/35"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${running ? "animate-pulse" : "bg-white/30"}`}
              style={running ? { background: "var(--a1)" } : undefined}
            />
            {running ? "en cours" : "en pause"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile icon={<Dna size={13} />} label="Vivants" value={stats.total.toLocaleString("fr-FR")} accent="var(--a2)" />
        <StatTile icon={<Activity size={13} />} label="Excités" value={stats.excited.toLocaleString("fr-FR")} sub={`${excitedPct}%`} accent="var(--a1)" />
        <StatTile icon={<Link2 size={13} />} label="Liaisons" value={stats.links.toLocaleString("fr-FR")} accent="var(--a1)" />
        <StatTile icon={<Radius size={13} />} label="Degré moyen" value={stats.avgDegree.toFixed(1)} accent="var(--a3)" />
      </div>

      {/* Distribution des phases */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-md">
        <span className="text-[11px] tracking-wide text-white/40 uppercase">Phases</span>
        <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div style={{ width: `${excW}%`, background: "var(--a1)" }} />
          <div style={{ width: `${refW}%`, background: "var(--a2)" }} />
          <div style={{ width: `${restW}%`, background: "rgba(255,255,255,0.14)" }} />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-white/50">
          <span style={{ color: "var(--a1)" }}>excités {stats.excited}</span>
          <span style={{ color: "var(--a2)" }}>réfractaires {stats.refractory}</span>
          <span className="text-white/40">repos {stats.rest}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 pt-2 backdrop-blur-md">
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-[11px] tracking-wide text-white/40 uppercase">Activité</span>
          <span className="flex items-center gap-3 font-mono text-[10px]">
            <span className="flex items-center gap-1" style={{ color: chartColors.excited }}>
              <span className="h-1 w-2.5 rounded" style={{ background: chartColors.excited }} /> excités
            </span>
            <span className="flex items-center gap-1" style={{ color: chartColors.total }}>
              <span className="h-1 w-2.5 rounded" style={{ background: chartColors.total }} /> vivants
            </span>
          </span>
        </div>
        <PopulationChart history={history} colors={chartColors} />
      </div>

      <div className="px-1 font-mono text-[10px] text-white/25">graine #{seed.toString(16)}</div>
    </div>
  );
}
