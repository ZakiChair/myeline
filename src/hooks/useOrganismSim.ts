"use client";

// Pilotage du worker de simulation (lot 2). Le worker détient l'organisme et
// tourne à son rythme ; ici on reçoit les images (activité transférée + instantané
// compact) et on rend chaque buffer consommé — ping-pong, jamais de copie.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { randomSeed } from "@/lib/rng";
import type { VieSnapshot } from "@/sim/snapshot";
import type { RegionInfo, WorkerIn, WorkerOut } from "@/worker/protocol";

/** Taille par défaut du réseau affiché (la cible du projet). */
export const N_DEFAUT = 50_000;
/** Nombre de buffers d'activité en circulation dans le ping-pong. */
const NB_BUFFERS = 3;
/** Fréquence de mise à jour de l'état React « stats » (les vues lisent les refs à 60 fps). */
const STATS_MS = 250;

export interface OrganismSim {
  ready: boolean;
  n: number;
  e: number;
  positions: Float32Array | null;
  regions: RegionInfo[];
  /** Dernière activité reçue — mutée en place par les frames, lue par les vues. */
  activityRef: RefObject<Float32Array | null>;
  /** Dernier instantané compact (monde, accumulateurs, compteurs). */
  snapRef: RefObject<VieSnapshot | null>;
  /** Version d'arêtes reçue pour la surcouche (null tant que non demandée). */
  edges: Uint32Array | null;
  requestEdges: () => void;
  /** Copie React du dernier instantané, rafraîchie à ~4 Hz (panneaux texte). */
  stats: VieSnapshot | null;
  running: boolean;
  toggleRun: () => void;
  /** Cadence DEMANDÉE en ticks/s ; le débit mesuré est dans snap.measuredTps. */
  speed: number;
  setSpeed: (hz: number) => void;
  size: number;
  /** Reconstruit l'organisme : nouvelle graine (et nouvelle taille si fournie). */
  regenerate: (n?: number) => void;
}

export function useOrganismSim(): OrganismSim {
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [speed, setSpeedState] = useState(150);
  const [size, setSize] = useState(N_DEFAUT);
  const [positions, setPositions] = useState<Float32Array | null>(null);
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [nbAretes, setNbAretes] = useState(0);
  const [edges, setEdges] = useState<Uint32Array | null>(null);
  const [stats, setStats] = useState<VieSnapshot | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const activityRef = useRef<Float32Array | null>(null);
  const snapRef = useRef<VieSnapshot | null>(null);
  const dernierStatsRef = useRef(0);
  const sizeRef = useRef(size);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    const worker = new Worker(new URL("../worker/sim.worker.ts", import.meta.url));
    workerRef.current = worker;

    const envoyer = (msg: WorkerIn, transfer: Transferable[] = []) =>
      worker.postMessage(msg, { transfer });

    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const msg = e.data;
      switch (msg.type) {
        case "ready":
          setPositions(msg.positions);
          setRegions(msg.regions);
          setNbAretes(msg.e);
          setEdges(null);
          setReady(true);
          // Le worker est la source de vérité : marche à l'init, conservée au reset.
          setRunning(msg.running);
          break;
        case "frame": {
          // Rendre le buffer précédent au pool du worker avant d'adopter le nouveau.
          const ancien = activityRef.current;
          if (ancien && ancien.byteLength === msg.activity.byteLength) {
            const buf = ancien.buffer as ArrayBuffer;
            envoyer({ type: "recycle", buffer: buf }, [buf]);
          }
          activityRef.current = msg.activity;
          snapRef.current = msg.snap;
          const now = performance.now();
          if (now - dernierStatsRef.current >= STATS_MS) {
            dernierStatsRef.current = now;
            setStats(msg.snap);
          }
          break;
        }
        case "edges":
          setEdges(msg.pairs);
          break;
      }
    };

    const n = sizeRef.current;
    const buffers = Array.from({ length: NB_BUFFERS }, () => new ArrayBuffer(n * 4));
    envoyer(
      { type: "init", n, seed: randomSeed(), worldSeed: randomSeed(), buffers },
      buffers,
    );

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const toggleRun = useCallback(() => {
    setRunning((r) => {
      workerRef.current?.postMessage({ type: "run", running: !r } satisfies WorkerIn);
      return !r;
    });
  }, []);

  const setSpeed = useCallback((hz: number) => {
    setSpeedState(hz);
    workerRef.current?.postMessage({ type: "speed", hz } satisfies WorkerIn);
  }, []);

  const regenerate = useCallback((n?: number) => {
    const taille = n ?? sizeRef.current;
    setSize(taille);
    sizeRef.current = taille;
    setReady(false);
    activityRef.current = null;
    workerRef.current?.postMessage({
      type: "reset",
      n: taille,
      seed: randomSeed(),
      worldSeed: randomSeed(),
    } satisfies WorkerIn);
  }, []);

  const requestEdges = useCallback(() => {
    workerRef.current?.postMessage({ type: "edges" } satisfies WorkerIn);
  }, []);

  return {
    ready,
    n: size,
    e: nbAretes,
    positions,
    regions,
    activityRef,
    snapRef,
    edges,
    requestEdges,
    stats,
    running,
    toggleRun,
    speed,
    setSpeed,
    size,
    regenerate,
  };
}
