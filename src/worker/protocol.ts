// Contrat worker ↔ thread principal du lot 2. Fichier de TYPES uniquement —
// partagé par les deux côtés sans importer de code lié à un environnement.

import type { RegionId } from "../sim/params";
import type { VieSnapshot } from "../sim/snapshot";

/** Description d'une région, pour colorier le cerveau côté rendu. */
export interface RegionInfo {
  id: RegionId;
  start: number;
  count: number;
  pools: number;
  poolSize: number;
}

/** Messages envoyés AU worker. */
export type WorkerIn =
  | {
      type: "init";
      n: number;
      seed: number;
      worldSeed: number;
      /** Buffers d'activité pré-alloués par le main (ping-pong). */
      buffers: ArrayBuffer[];
    }
  | { type: "run"; running: boolean }
  | { type: "speed"; hz: number }
  /** Demande le sous-échantillon d'arêtes pour la surcouche de rendu. */
  | { type: "edges" }
  /** Le main rend un buffer d'activité consommé au pool du worker. */
  | { type: "recycle"; buffer: ArrayBuffer }
  /** Reconstruit tout : autre graine, autre graine de monde, autre taille. */
  | { type: "reset"; n: number; seed: number; worldSeed: number };

/** Messages envoyés PAR le worker. */
export type WorkerOut =
  | {
      type: "ready";
      n: number;
      e: number;
      /** positions entrelacées [x0,y0,z0, x1,y1,z1, …] — attribut three.js direct. */
      positions: Float32Array;
      regions: RegionInfo[];
      /** État de marche du worker — vrai après init, conservé après reset. */
      running: boolean;
    }
  | {
      type: "frame";
      /** Niveau lumineux par neurone (décharge = 1, décroissance exponentielle). */
      activity: Float32Array;
      snap: VieSnapshot;
    }
  | {
      type: "edges";
      /** Paires d'indices source→cible, sous-échantillon pour le rendu. */
      pairs: Uint32Array;
    };
