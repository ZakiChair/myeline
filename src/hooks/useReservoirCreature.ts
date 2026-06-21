"use client";

// Orchestrateur de l'organisme à réservoir : fait tourner la boucle de fourrage
// (reservoir-creature.ts) et expose DEUX états lus par l'UI — le monde (corps + pastille,
// pour l'onglet Créature) et le graphe du réservoir (pour l'onglet Échelle live).

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  makeReservoirCreature,
  stepCreature,
  type ReservoirCreature,
  type CreatureWorld,
} from "@/lib/reservoir-creature";
import { randomSeed } from "@/lib/rng";
import type { ScaleGraph } from "@/lib/scale-engine";

export interface OrganismStats {
  eaten: number;
  t: number;
  ratePer500: number; // pastilles sur les 500 derniers ticks (montre l'apprentissage)
  lastAction: number;
}

export interface OrganismController {
  worldRef: RefObject<CreatureWorld | null>;
  graphRef: RefObject<ScaleGraph | null>;
  stats: OrganismStats;
  running: boolean;
  speed: number;
  version: number;
  toggleRun: () => void;
  reset: () => void;
  setSpeed: (v: number) => void;
}

const EMPTY: OrganismStats = { eaten: 0, t: 0, ratePer500: 0, lastAction: -1 };

export function useReservoirCreature(): OrganismController {
  const [running, setRunning] = useState(true);
  const [speed, setSpeedState] = useState(14);
  const [stats, setStats] = useState<OrganismStats>(EMPTY);
  const [version, setVersion] = useState(0);

  const creatureRef = useRef<ReservoirCreature | null>(null);
  const worldRef = useRef<CreatureWorld | null>(null);
  const graphRef = useRef<ScaleGraph | null>(null);
  const windowRef = useRef({ t: 0, eaten: 0, rate: 0 });

  const build = useCallback((seed: number) => {
    // Différé (comme useScaleSimulation) : pas de setState synchrone dans l'effet de montage.
    setTimeout(() => {
      const c = makeReservoirCreature(seed, true);
      creatureRef.current = c;
      worldRef.current = c.world;
      graphRef.current = c.res.g;
      windowRef.current = { t: 0, eaten: 0, rate: 0 };
      setStats(EMPTY);
      setVersion((v) => v + 1);
    }, 0);
  }, []);

  useEffect(() => {
    build(randomSeed());
  }, [build]);

  const stepOnce = useCallback(() => {
    const c = creatureRef.current;
    if (!c) return;
    stepCreature(c);
    const w = c.world;
    const win = windowRef.current;
    if (w.t - win.t >= 500) {
      win.rate = w.eaten - win.eaten;
      win.t = w.t;
      win.eaten = w.eaten;
    }
    setStats({ eaten: w.eaten, t: w.t, ratePer500: win.rate, lastAction: w.lastAction });
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(stepOnce, Math.round(1000 / speed));
    return () => clearInterval(id);
  }, [running, speed, stepOnce]);

  const toggleRun = useCallback(() => setRunning((r) => !r), []);
  const reset = useCallback(() => build(randomSeed()), [build]);
  const setSpeed = useCallback((v: number) => setSpeedState(v), []);

  return { worldRef, graphRef, stats, running, speed, version, toggleRun, reset, setSpeed };
}
