"use client";

import {
  Brush,
  CircleDot,
  Clock,
  Flame,
  Gauge,
  GitBranch,
  Maximize2,
  Network,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Spline,
  StepForward,
  Timer,
  TrendingUp,
  Volume2,
  VolumeX,
  Waves,
  Workflow,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { SimController } from "@/hooks/useSimulation";

interface Props {
  sim: SimController;
  audioOn: boolean;
  onToggleAudio: (value: boolean) => void;
  onFit: () => void;
  brushMode: boolean;
  onToggleBrush: (value: boolean) => void;
}

function coerce(v: number | number[] | readonly number[]): number {
  return Array.isArray(v) ? v[0] : (v as number);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-md">
      <h3 className="mb-3 text-[11px] font-medium tracking-wider text-white/40 uppercase">
        {title}
      </h3>
      <div className="flex flex-col gap-3.5">{children}</div>
    </div>
  );
}

function LabeledSlider({
  icon,
  label,
  value,
  display,
  min,
  max,
  step = 1,
  accent,
  onChange,
  onCommit,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  accent: string;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-white/70">
        <span className="flex items-center gap-1.5">
          <span className={accent}>{icon}</span>
          {label}
        </span>
        <span className="font-mono tabular-nums text-white/90">{display}</span>
      </div>
      <Slider
        className="mt-2"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(coerce(v))}
        onValueCommitted={onCommit ? (v) => onCommit(coerce(v)) : undefined}
      />
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  checked,
  accent,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  accent: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs text-white/70">
        <span className={accent}>{icon}</span>
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
    </div>
  );
}

export function ControlPanel({
  sim,
  audioOn,
  onToggleAudio,
  onFit,
  brushMode,
  onToggleBrush,
}: Props) {
  const [initialCount, setInitialCount] = useState(sim.params.initialCount);
  const [ratioPct, setRatioPct] = useState(Math.round(sim.params.activeRatio * 100));

  const p = sim.params;

  return (
    <div className="flex flex-col gap-4">
      {/* Transport */}
      <Section title="Simulation">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={sim.running ? "secondary" : "default"}
            onClick={sim.toggleRun}
            className={sim.running ? "" : "shadow-[0_0_22px_-6px_var(--a1)]"}
          >
            {sim.running ? <Pause /> : <Play />}
            {sim.running ? "Pause" : "Lancer"}
          </Button>
          <Button variant="outline" onClick={sim.stepOnce} disabled={sim.running}>
            <StepForward />
            Pas à pas
          </Button>
          <Button variant="ghost" onClick={sim.reset}>
            <RotateCcw />
            Réinitialiser
          </Button>
          <Button variant="ghost" onClick={onFit}>
            <Maximize2 />
            Recentrer
          </Button>
        </div>
        <LabeledSlider
          icon={<Gauge size={13} />}
          label="Vitesse"
          value={sim.speed}
          display={`${sim.speed} tick/s`}
          min={1}
          max={14}
          accent="text-[var(--a1)]"
          onChange={sim.setSpeed}
        />
        <ToggleRow
          icon={<Brush size={13} />}
          label="Pinceau de stimulation"
          checked={brushMode}
          accent="text-[var(--a3)]"
          onChange={onToggleBrush}
        />
      </Section>

      {/* Réseau (génération) */}
      <Section title="Réseau">
        <LabeledSlider
          icon={<CircleDot size={13} />}
          label="Neurones initiaux"
          value={initialCount}
          display={`${initialCount}`}
          min={5}
          max={3000}
          step={5}
          accent="text-[var(--a2)]"
          onChange={setInitialCount}
          onCommit={(v) => sim.setBuildParam("initialCount", v)}
        />
        <LabeledSlider
          icon={<Flame size={13} />}
          label="Ratio actif initial"
          value={ratioPct}
          display={`${ratioPct}%`}
          min={0}
          max={100}
          accent="text-[var(--a1)]"
          onChange={setRatioPct}
          onCommit={(v) => sim.setBuildParam("activeRatio", v / 100)}
        />
        <LabeledSlider
          icon={<TrendingUp size={13} />}
          label="Plafond de population"
          value={p.populationCap}
          display={`${p.populationCap}`}
          min={20}
          max={3000}
          step={10}
          accent="text-[var(--a3)]"
          onChange={(v) => sim.setLiveParam("populationCap", v)}
        />
        <Button
          variant="outline"
          onClick={sim.regenerate}
          className="w-full text-[var(--a2)] hover:bg-white/5"
        >
          <Sparkles />
          Générer nouveau réseau
        </Button>
      </Section>

      {/* Activité (horloge rapide) */}
      <Section title="Activité">
        <LabeledSlider
          icon={<Waves size={13} />}
          label="Seuil de décharge φ"
          value={Math.round(p.fireFraction * 100)}
          display={`${Math.round(p.fireFraction * 100)}%`}
          min={5}
          max={90}
          accent="text-[var(--a1)]"
          onChange={(v) => sim.setLiveParam("fireFraction", v / 100)}
        />
        <LabeledSlider
          icon={<Timer size={13} />}
          label="Période réfractaire"
          value={p.refractory}
          display={`${p.refractory} tick`}
          min={1}
          max={6}
          accent="text-[var(--a2)]"
          onChange={(v) => sim.setLiveParam("refractory", v)}
        />
        <LabeledSlider
          icon={<Zap size={13} />}
          label="Étincelle spontanée"
          value={Math.round(p.spontaneous * 1000)}
          display={`${(p.spontaneous * 100).toFixed(1)}%`}
          min={0}
          max={50}
          accent="text-[var(--a3)]"
          onChange={(v) => sim.setLiveParam("spontaneous", v / 1000)}
        />
        <LabeledSlider
          icon={<Clock size={13} />}
          label="Développement tous les"
          value={p.developEvery}
          display={`${p.developEvery} ticks`}
          min={2}
          max={15}
          accent="text-[var(--a3)]"
          onChange={(v) => sim.setLiveParam("developEvery", v)}
        />
      </Section>

      {/* Plasticité & structure (horloge lente) */}
      <Section title="Plasticité & structure">
        <ToggleRow
          icon={<Workflow size={13} />}
          label="Plasticité hebbienne"
          checked={p.hebbian}
          accent="text-[var(--a1)]"
          onChange={(v) => sim.setLiveParam("hebbian", v)}
        />
        <LabeledSlider
          icon={<Spline size={13} />}
          label="Synaptogenèse q"
          value={Math.round(p.synaptogenesis * 100)}
          display={`${(p.synaptogenesis * 100).toFixed(0)}%`}
          min={0}
          max={10}
          accent="text-[var(--a1)]"
          onChange={(v) => sim.setLiveParam("synaptogenesis", v / 100)}
        />
        <LabeledSlider
          icon={<Network size={13} />}
          label="Degré maximum"
          value={p.maxDegree}
          display={`${p.maxDegree}`}
          min={6}
          max={40}
          accent="text-[var(--a1)]"
          onChange={(v) => sim.setLiveParam("maxDegree", v)}
        />
        <LabeledSlider
          icon={<Shield size={13} />}
          label="Seuil de survie"
          value={p.surviveThreshold}
          display={`degré < ${p.surviveThreshold}`}
          min={1}
          max={5}
          accent="text-[var(--a1)]"
          onChange={(v) => sim.setLiveParam("surviveThreshold", v)}
        />
        <LabeledSlider
          icon={<GitBranch size={13} />}
          label="Seuil de naissance"
          value={p.birthThreshold}
          display={`degré ≥ ${p.birthThreshold}`}
          min={3}
          max={14}
          accent="text-[var(--a3)]"
          onChange={(v) => sim.setLiveParam("birthThreshold", v)}
        />
      </Section>

      {/* Audio */}
      <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 backdrop-blur-md">
        <span className="flex items-center gap-2 text-xs text-white/70">
          <span className="text-[var(--a1)]">
            {audioOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </span>
          Ambiance sonore
        </span>
        <Switch checked={audioOn} onCheckedChange={(v) => onToggleAudio(Boolean(v))} />
      </div>
    </div>
  );
}
