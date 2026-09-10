"use client";

// Orchestrateur : deux horloges. ACTIVITÉ chaque tick (mute l'état des nœuds de
// rendu en place → le canvas, redessiné en continu, montre les ondes sans
// reheat du layout). DÉVELOPPEMENT tous les developEvery ticks (topologie qui
// change → reconstruction de graphData).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createInitialGraph,
  step,
  computeStats,
  edgeList,
  DEFAULT_PARAMS,
} from "@/lib/simulation";
import { mulberry32, randomSeed, type RNG } from "@/lib/rng";
import { reportTick } from "@/lib/audio";
import type {
  DroppedEdgeGhost,
  GraphData,
  HistoryPoint,
  NeuronNode,
  SimGraph,
  SimParams,
  Stats,
  TickEvents,
} from "@/lib/types";

const MAX_HISTORY = 220;
const DYING_MS = 650;
const DROP_FADE_MS = 520;

function speedToInterval(speed: number): number {
  return Math.round(1000 / speed);
}

const EMPTY_STATS: Stats = {
  generation: 0,
  total: 0,
  excited: 0,
  refractory: 0,
  rest: 0,
  links: 0,
  avgDegree: 0,
};

export interface SimController {
  graphData: GraphData;
  stats: Stats;
  history: HistoryPoint[];
  params: SimParams;
  running: boolean;
  speed: number;
  seed: number;
  buildNonce: number;
  /** Vue vivante des arêtes fantômes (leur contenu mute sans notifier React). */
  getDroppedEdges: () => DroppedEdgeGhost[];
  toggleRun: () => void;
  stepOnce: () => void;
  reset: () => void;
  regenerate: () => void;
  setLiveParam: (key: keyof SimParams, value: number | boolean) => void;
  setBuildParam: (key: keyof SimParams, value: number) => void;
  setSpeed: (value: number) => void;
  exciteNode: (id: number) => void;
}

export function useSimulation(): SimController {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS);
  const [running, setRunning] = useState(false);
  const [speed, setSpeedState] = useState(4);
  const [seed, setSeed] = useState<number>(0);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [buildNonce, setBuildNonce] = useState(0);

  const graphRef = useRef<SimGraph | null>(null);
  const nodesRef = useRef<Map<number, NeuronNode>>(new Map());
  const droppedEdgesRef = useRef<DroppedEdgeGhost[]>([]);
  const getDroppedEdges = useCallback(() => droppedEdgesRef.current, []);
  const rngRef = useRef<RNG>(mulberry32(seed));
  const genRef = useRef(0);
  const paramsRef = useRef(params);
  // La ref suit l'état React en effet, jamais pendant le rendu : les lecteurs
  // (build, stepOnce, reset…) sont des callbacks ou des effets, donc toujours
  // servis après la synchronisation.
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  const rebuildGraphData = useCallback((g: SimGraph) => {
    const links = edgeList(g).map(([s, t, w]) => ({ source: s, target: t, weight: w }));
    setGraphData({ nodes: Array.from(nodesRef.current.values()), links });
  }, []);

  const build = useCallback(
    (sd: number, p: SimParams) => {
      // La graine vit au même endroit que le graphe qu'elle a engendré : chaque
      // (re)construction met les deux à jour ensemble.
      setSeed(sd);
      const rng = mulberry32(sd);
      const g = createInitialGraph(p, rng);
      rngRef.current = rng;
      graphRef.current = g;
      genRef.current = 0;
      droppedEdgesRef.current = [];

      const nodes = new Map<number, NeuronNode>();
      for (const [id, nd] of g.nodes) {
        nodes.set(id, {
          id,
          state: nd.state,
          cooldown: nd.cooldown,
          vitality: nd.vitality,
          degree: g.adjacency.get(id)!.size,
        });
      }
      nodesRef.current = nodes;
      rebuildGraphData(g);

      const st = computeStats(g, 0);
      setStats(st);
      setHistory([{ generation: 0, total: st.total, excited: st.excited }]);
      setBuildNonce((n) => n + 1);
    },
    [rebuildGraphData],
  );

  useEffect(() => {
    build(randomSeed(), paramsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncRender = useCallback(
    (g: SimGraph, events: TickEvents, develop: boolean) => {
      const now = performance.now();
      const nodes = nodesRef.current;

      for (const [id, n] of nodes) {
        if (n.dyingAt !== undefined && now - n.dyingAt > DYING_MS) nodes.delete(id);
      }

      if (develop) {
        for (const id of events.died) {
          const n = nodes.get(id);
          if (n) n.dyingAt = now;
        }
        for (const b of events.born) {
          const nd = g.nodes.get(b.id);
          if (!nd) continue;
          const parent = nodes.get(b.parentId);
          const angle = Math.random() * Math.PI * 2;
          const rad = 8 + Math.random() * 10;
          nodes.set(b.id, {
            id: b.id,
            state: nd.state,
            cooldown: nd.cooldown,
            vitality: nd.vitality,
            degree: g.adjacency.get(b.id)!.size,
            bornAt: now,
            x: (parent?.x ?? 0) + Math.cos(angle) * rad,
            y: (parent?.y ?? 0) + Math.sin(angle) * rad,
            vx: 0,
            vy: 0,
          });
        }
      }

      // Mise à jour des champs dynamiques (objets réutilisés → positions préservées).
      for (const [id, nd] of g.nodes) {
        let n = nodes.get(id);
        if (!n) {
          n = { id, state: nd.state, cooldown: nd.cooldown, vitality: nd.vitality, degree: 0 };
          nodes.set(id, n);
        }
        n.state = nd.state;
        n.cooldown = nd.cooldown;
        n.vitality = nd.vitality;
        n.degree = g.adjacency.get(id)!.size;
        n.dyingAt = undefined;
      }

      if (develop) {
        for (const [a, b] of events.droppedEdges) {
          const na = nodes.get(a);
          const nb = nodes.get(b);
          if (na && nb) droppedEdgesRef.current.push({ a: na, b: nb, at: now });
        }
        droppedEdgesRef.current = droppedEdgesRef.current.filter(
          (gh) => now - gh.at < DROP_FADE_MS,
        );
        // La topologie a changé → on reconstruit les tableaux remis au moteur de layout.
        rebuildGraphData(g);
      }
      // Sur un tick d'activité pure : on ne touche pas graphData ; le canvas
      // (redraw continu) reflète l'état muté en place des mêmes objets nœuds.
    },
    [rebuildGraphData],
  );

  const stepOnce = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    const gen = genRef.current + 1;
    const develop = gen % Math.max(1, paramsRef.current.developEvery) === 0;
    const { graph, events } = step(g, paramsRef.current, rngRef.current, develop);
    graphRef.current = graph;
    genRef.current = gen;
    syncRender(graph, events, develop);

    const st = computeStats(graph, gen);
    setStats(st);
    setHistory((h) => {
      const next = [...h, { generation: gen, total: st.total, excited: st.excited }];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
    if (events.born.length || events.died.length) {
      reportTick(events.born.length, events.died.length);
    }
  }, [syncRender]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(stepOnce, speedToInterval(speed));
    return () => clearInterval(id);
  }, [running, speed, stepOnce]);

  const toggleRun = useCallback(() => setRunning((r) => !r), []);

  const reset = useCallback(() => {
    setRunning(false);
    build(seed, paramsRef.current);
  }, [build, seed]);

  const regenerate = useCallback(() => {
    setRunning(false);
    build(randomSeed(), paramsRef.current);
  }, [build]);

  const setLiveParam = useCallback((key: keyof SimParams, value: number | boolean) => {
    const np = { ...paramsRef.current, [key]: value };
    paramsRef.current = np;
    setParams(np);
  }, []);

  const setBuildParam = useCallback(
    (key: keyof SimParams, value: number) => {
      const np = { ...paramsRef.current, [key]: value };
      paramsRef.current = np;
      setParams(np);
      build(seed, np);
    },
    [build, seed],
  );

  const setSpeed = useCallback((value: number) => setSpeedState(value), []);

  // Clic / pinceau → injecte une décharge (le neurone tire maintenant).
  const exciteNode = useCallback((id: number) => {
    const g = graphRef.current;
    if (!g) return;
    const nd = g.nodes.get(id);
    if (!nd) return;
    nd.state = 1;
    nd.cooldown = 0;
    nd.vitality = Math.min(20, nd.vitality + 6);
    const n = nodesRef.current.get(id);
    if (n) {
      n.state = 1;
      n.cooldown = 0;
      n.vitality = nd.vitality;
    }
  }, []);

  return {
    graphData,
    stats,
    history,
    params,
    running,
    speed,
    seed,
    buildNonce,
    getDroppedEdges,
    toggleRun,
    stepOnce,
    reset,
    regenerate,
    setLiveParam,
    setBuildParam,
    setSpeed,
    exciteNode,
  };
}
