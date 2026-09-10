"use client";

// Orchestrateur du mode « Échelle » : pilote le moteur typed-array (scale-engine),
// expose les buffers (via une ref) au rendu point-cloud, les stats et l'historique.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  createScaleGraph,
  stepScale,
  scaleStats,
  type ScaleGraph,
} from "@/lib/scale-engine";
import { mulberry32, randomSeed, type RNG } from "@/lib/rng";
import { DEFAULT_PARAMS } from "@/lib/rules";
import type { HistoryPoint, SimParams, Stats } from "@/lib/types";

const MAX_HISTORY = 220;

const SCALE_DEFAULTS: SimParams = {
  ...DEFAULT_PARAMS,
  initialCount: 5000,
  populationCap: 5000,
  // Peu de foyers spontanés → chaque étincelle engendre une onde visible dans le
  // volume (au lieu d'un scintillement uniforme sur des dizaines de milliers de nœuds).
  spontaneous: 0.004,
};

const EMPTY_STATS: Stats = {
  generation: 0,
  total: 0,
  excited: 0,
  refractory: 0,
  rest: 0,
  links: 0,
  avgDegree: 0,
};

function speedToInterval(speed: number): number {
  return Math.round(1000 / speed);
}

export interface ScaleController {
  graphRef: RefObject<ScaleGraph | null>;
  stats: Stats;
  history: HistoryPoint[];
  params: SimParams;
  running: boolean;
  speed: number;
  seed: number;
  buildVersion: number;
  building: boolean;
  toggleRun: () => void;
  stepOnce: () => void;
  reset: () => void;
  regenerate: () => void;
  setSize: (n: number) => void;
  setLiveParam: (key: keyof SimParams, value: number | boolean) => void;
  setSpeed: (value: number) => void;
  exciteNode: (slot: number) => void;
}

export function useScaleSimulation(): ScaleController {
  const [params, setParams] = useState<SimParams>(SCALE_DEFAULTS);
  const [running, setRunning] = useState(false);
  const [speed, setSpeedState] = useState(6);
  const [seed, setSeed] = useState(0);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [buildVersion, setBuildVersion] = useState(0);
  const [building, setBuilding] = useState(true);

  const graphRef = useRef<ScaleGraph | null>(null);
  const rngRef = useRef<RNG>(mulberry32(0));
  const genRef = useRef(0);
  const paramsRef = useRef(params);
  // La ref suit l'état React en effet, jamais pendant le rendu : les lecteurs
  // (build, stepOnce, reset…) sont des callbacks ou des effets, donc toujours
  // servis après la synchronisation.
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const build = useCallback((sd: number, p: SimParams) => {
    setBuilding(true);
    // La graine vit au même endroit que le graphe qu'elle a engendré : chaque
    // (re)construction met les deux à jour ensemble.
    setSeed(sd);
    // Laisse le navigateur peindre l'état « construction » avant un gros build.
    setTimeout(() => {
      const rng = mulberry32(sd);
      const g = createScaleGraph(p, rng);
      rngRef.current = rng;
      graphRef.current = g;
      genRef.current = 0;
      const st = scaleStats(g, 0);
      setStats(st);
      setHistory([{ generation: 0, total: st.total, excited: st.excited }]);
      setBuildVersion((v) => v + 1);
      setBuilding(false);
    }, 0);
  }, []);

  useEffect(() => {
    build(randomSeed(), paramsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepOnce = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    const gen = genRef.current + 1;
    const develop = gen % Math.max(1, paramsRef.current.developEvery) === 0;
    stepScale(g, paramsRef.current, rngRef.current, develop);
    genRef.current = gen;
    const st = scaleStats(g, gen);
    setStats(st);
    setHistory((h) => {
      const next = [...h, { generation: gen, total: st.total, excited: st.excited }];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
  }, []);

  useEffect(() => {
    if (!running || building) return;
    const id = setInterval(stepOnce, speedToInterval(speed));
    return () => clearInterval(id);
  }, [running, speed, stepOnce, building]);

  const toggleRun = useCallback(() => setRunning((r) => !r), []);

  const reset = useCallback(() => {
    setRunning(false);
    build(seed, paramsRef.current);
  }, [build, seed]);

  const regenerate = useCallback(() => {
    setRunning(false);
    build(randomSeed(), paramsRef.current);
  }, [build]);

  const setSize = useCallback(
    (n: number) => {
      setRunning(false);
      const np = { ...paramsRef.current, initialCount: n, populationCap: n };
      paramsRef.current = np;
      setParams(np);
      build(seed, np);
    },
    [build, seed],
  );

  const setLiveParam = useCallback((key: keyof SimParams, value: number | boolean) => {
    const np = { ...paramsRef.current, [key]: value };
    paramsRef.current = np;
    setParams(np);
  }, []);

  const setSpeed = useCallback((value: number) => setSpeedState(value), []);

  const exciteNode = useCallback((slot: number) => {
    const g = graphRef.current;
    if (!g || !g.alive[slot]) return;
    g.state[slot] = 1;
    g.cooldown[slot] = 0;
    g.vitality[slot] = Math.min(20, g.vitality[slot] + 8);
  }, []);

  return {
    graphRef,
    stats,
    history,
    params,
    running,
    speed,
    seed,
    buildVersion,
    building,
    toggleRun,
    stepOnce,
    reset,
    regenerate,
    setSize,
    setLiveParam,
    setSpeed,
    exciteNode,
  };
}
