"use client";

// Orchestrateur du mode « Créature » : pilote la boucle d'essais (world.ts), expose
// l'état du monde (via une ref, lu par le canvas chaque frame) et des stats légères.
// Le déterminisme du socle est conservé : rngs gainés, spontaneous=0 ⇒ rng moteur inerte.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { makeCreatureBrain, poolWeight, BETA, SENS, MOT_B, MOT_C } from "@/lib/creature";
import { initWorld, stepWorld, type CreatureState } from "@/lib/world";
import { mulberry32, randomSeed, type RNG } from "@/lib/rng";
import type { ScaleGraph } from "@/lib/scale-engine";

export interface CreatureStats {
  trial: number;
  eaten: number;
  wB: number; // poids appris SENS→B (approcher)
  wC: number; // poids appris SENS→C (mauvaise direction)
  confidence: number; // P(approche) ≈ sigmoid(BETA·(wB−wC)) — sans perturber le réseau
}

export interface CreatureController {
  worldRef: RefObject<CreatureState | null>;
  brainRef: RefObject<ScaleGraph | null>;
  stats: CreatureStats;
  running: boolean;
  speed: number;
  version: number;
  toggleRun: () => void;
  stepOnce: () => void;
  reset: () => void;
  setSpeed: (v: number) => void;
}

const EMPTY: CreatureStats = { trial: 0, eaten: 0, wB: 0, wC: 0, confidence: 0.5 };

/** Stats dérivées des poids appris — pure, sans perturber l'état transitoire du réseau. */
function computeStats(brain: ScaleGraph, world: CreatureState): CreatureStats {
  const wB = poolWeight(brain, SENS, MOT_B);
  const wC = poolWeight(brain, SENS, MOT_C);
  return {
    trial: world.trial,
    eaten: world.eaten,
    wB,
    wC,
    confidence: 1 / (1 + Math.exp(-BETA * (wB - wC))),
  };
}

export function useCreature(): CreatureController {
  const [running, setRunning] = useState(true);
  const [speed, setSpeedState] = useState(8);
  const [stats, setStats] = useState<CreatureStats>(EMPTY);
  const [version, setVersion] = useState(0);

  const worldRef = useRef<CreatureState | null>(null);
  const brainRef = useRef<ScaleGraph | null>(null);
  const exploreRef = useRef<RNG>(mulberry32(0));
  const stepRef = useRef<RNG>(mulberry32(0));
  const spawnRef = useRef<RNG>(mulberry32(0));

  const build = useCallback((sd: number) => {
    // Différé (comme useScaleSimulation) : pas de setState synchrone dans l'effet de montage.
    setTimeout(() => {
      const brain = makeCreatureBrain();
      const spawn = mulberry32((sd ^ 0x9e3779b9) >>> 0);
      const world = initWorld(spawn);
      brainRef.current = brain;
      worldRef.current = world;
      exploreRef.current = mulberry32(sd);
      stepRef.current = mulberry32(0); // non consommé (spontaneous=0)
      spawnRef.current = spawn;
      setStats(computeStats(brain, world));
      setVersion((v) => v + 1);
    }, 0);
  }, []);

  useEffect(() => {
    build(randomSeed());
  }, [build]);

  const stepOnce = useCallback(() => {
    const world = worldRef.current;
    const brain = brainRef.current;
    if (!world || !brain) return;
    stepWorld(world, brain, exploreRef.current, stepRef.current, spawnRef.current);
    setStats(computeStats(brain, world));
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(stepOnce, Math.round(1000 / speed));
    return () => clearInterval(id);
  }, [running, speed, stepOnce]);

  const toggleRun = useCallback(() => setRunning((r) => !r), []);
  const reset = useCallback(() => build(randomSeed()), [build]);
  const setSpeed = useCallback((v: number) => setSpeedState(v), []);

  return {
    worldRef,
    brainRef,
    stats,
    running,
    speed,
    version,
    toggleRun,
    stepOnce,
    reset,
    setSpeed,
  };
}
