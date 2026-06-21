// Types partagés du domaine de simulation Myéline et du rendu.
//
// Modèle d'activité : automate excitable type Greenberg–Hastings.
//   repos ──(fraction de voisins excités ≥ φ  OU  étincelle)──▶ EXCITÉ (state=1)
//   EXCITÉ ──▶ réfractaire (R ticks, ne peut pas tirer) ──▶ repos
// Plasticité : poids hebbiens sur les liaisons (« fire together, wire together »).
// Deux horloges : activité chaque tick, développement (mort/naissance/câblage)
// tous les `developEvery` ticks.

/** État instantané : 1 = excité (décharge ce tick), 0 = repos ou réfractaire. */
export type NeuronState = 0 | 1;

/** État complet d'un neurone. */
export interface NodeData {
  state: NeuronState;
  /** Ticks réfractaires restants (>0 ⇒ ne peut pas tirer). */
  cooldown: number;
  /** Intègre l'activité récente : +gain à chaque décharge, −1 sinon. Pilote mort/naissance. */
  vitality: number;
  /** Signe du neurone (loi de Dale) : +1 excitateur, -1 inhibiteur. */
  sign: 1 | -1;
}

/** Paramètres pilotant la génération, l'activité et le développement du réseau. */
export interface SimParams {
  // — Génération initiale —
  initialCount: number;
  activeRatio: number;
  minInitialLinks: number;
  maxInitialLinks: number;

  // — Activité (horloge rapide) —
  /** φ : fraction de voisins excités requise pour décharger (seuil relatif au degré). */
  fireFraction: number;
  /** R : durée de la période réfractaire en ticks. */
  refractory: number;
  /** p : probabilité de décharge spontanée d'un neurone au repos. */
  spontaneous: number;

  // — Développement (horloge lente) —
  /** Tous les `developEvery` ticks d'activité, on applique mort/naissance/câblage. */
  developEvery: number;
  /** Plafond de population : au-delà, naissances suspendues. */
  populationCap: number;
  /** Degré en dessous duquel un neurone silencieux meurt. */
  surviveThreshold: number;
  /** Degré au-dessus duquel un neurone très actif peut enfanter. */
  birthThreshold: number;
  /** Active la plasticité hebbienne (renforcement + synaptogenèse). */
  hebbian: boolean;
  /** q : probabilité de créer une synapse entre hubs co-actifs partageant un voisin. */
  synaptogenesis: number;
  /** Degré maximum d'un neurone (frein à la synaptogenèse). */
  maxDegree: number;
  /** Loi de Dale : fraction de neurones inhibiteurs (0 = tout excitateur). */
  inhibRatio: number;
  /** Règle de plasticité (moteur Échelle) : 'hebb' (same-tick, défaut) ou 'stdp'
   *  (pré@t-1 → post@t, directionnel, fait diverger les poids avant/arrière). */
  plasticity?: "hebb" | "stdp";
}

/** Graphe de simulation PUR (aucune dépendance au rendu). Non orienté. */
export interface SimGraph {
  /** id -> état du neurone. */
  nodes: Map<number, NodeData>;
  /** id -> ensemble des ids voisins (connectivité). */
  adjacency: Map<number, Set<number>>;
  /** clé d'arête canonique "a|b" -> poids synaptique. */
  weights: Map<string, number>;
  /** Prochain id (monotone). */
  nextId: number;
}

export interface BirthEvent {
  id: number;
  parentId: number;
}

/** Événements produits par un tick, consommés pour animations / audio. */
export interface TickEvents {
  born: BirthEvent[];
  died: number[];
  /** Synapses élaguées (rendu en fondu). */
  droppedEdges: Array<[number, number]>;
  /** Synapses créées par synaptogenèse (rendu en éclat). */
  newEdges: Array<[number, number]>;
  /** Nombre de neurones ayant déchargé ce tick. */
  excited: number;
}

/** Statistiques live d'une génération. */
export interface Stats {
  generation: number;
  /** Neurones vivants (non morts). */
  total: number;
  /** Neurones excités (déchargent ce tick). */
  excited: number;
  /** Neurones en période réfractaire. */
  refractory: number;
  /** Neurones au repos (prêts à décharger). */
  rest: number;
  links: number;
  avgDegree: number;
}

/** Point d'historique pour le tracé d'activité. */
export interface HistoryPoint {
  generation: number;
  total: number;
  excited: number;
}

/**
 * Nœud de rendu remis à react-force-graph. x/y/vx/vy gérés par le moteur :
 * réutiliser le MÊME objet entre ticks préserve la position.
 */
export interface NeuronNode {
  id: number;
  state: NeuronState;
  cooldown: number;
  vitality: number;
  degree: number;
  bornAt?: number;
  dyingAt?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

/** Liaison de rendu. source/target résolus en objets par le moteur. weight = force synaptique. */
export interface GraphLink {
  source: number | NeuronNode;
  target: number | NeuronNode;
  weight: number;
}

export interface GraphData {
  nodes: NeuronNode[];
  links: GraphLink[];
}

/** Synapse en train de se rompre : rendue en fondu (overlay only). */
export interface DroppedEdgeGhost {
  a: NeuronNode;
  b: NeuronNode;
  at: number;
}
