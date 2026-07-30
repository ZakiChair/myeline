// Le monde de l'organisme : arène, nourriture, toxine, prédateur, énergie, mort.
// Pur et déterministe. Ne connaît pas le cerveau : il reçoit une MotorAction et rend une
// Sensation, rien d'autre.
//
// La propriété centrale : nourriture et toxine passent par la MÊME fonction d'encodage, seul
// le canal diffère. L'organisme ne peut donc pas les distinguer gratuitement — il doit
// apprendre que le canal de la toxine prédit une punition. Rendre l'une plus intense que
// l'autre viderait la démonstration de son objet.

import type { RNG } from "../lib/rng";
import type { MotorAction, Sensation, WorldParams } from "./params";

export type WorldEventKind = "FOOD" | "TOXIN" | "PREDATOR" | "DEATH";

export interface WorldState {
  t: number;
  x: number;
  y: number;
  /**
   * Cap, en VECTEUR UNITAIRE plutôt qu'en radians. Voir `turnCos`/`turnSin` dans params.ts :
   * stocker un angle imposerait `Math.cos`/`Math.sin`, qui ne sont pas spécifiés au bit près
   * et faisaient diverger l'organisme entre moteurs JavaScript.
   */
  hx: number;
  hy: number;
  energy: number;
  alive: boolean;
  foodX: Float32Array;
  foodY: Float32Array;
  /** 0 = présente ; > 0 = consommée, réapparaît dans autant de ticks. */
  foodCooldown: Int32Array;
  toxinX: Float32Array;
  toxinY: Float32Array;
  toxinCooldown: Int32Array;
  predX: number;
  predY: number;
  ateFood: number;
  ateToxin: number;
  hits: number;
  deaths: number;
  /** Ticks écoulés depuis la dernière réapparition. */
  lifeTicks: number;
  /** Durée de la dernière vie close, 0 si aucune. L'historique appartient à `metrics`. */
  lastLifetime: number;
}

export interface WorldStep {
  reward: number;
  event: WorldEventKind | null;
  died: boolean;
}

/** Nombre de secteurs par modalité. Doit correspondre aux pools des régions sensorielles. */
export const SECTEURS_OLF = 24;
export const SECTEURS_ALARM = 16;
export const SECTEURS_SOMA = 8;

function placer(rng: RNG, arena: number): number {
  return (rng() * 2 - 1) * arena * 0.92;
}

export function createWorld(p: WorldParams, rng: RNG): WorldState {
  const foodX = new Float32Array(p.nFood);
  const foodY = new Float32Array(p.nFood);
  const toxinX = new Float32Array(p.nToxin);
  const toxinY = new Float32Array(p.nToxin);
  for (let i = 0; i < p.nFood; i++) {
    foodX[i] = placer(rng, p.arena);
    foodY[i] = placer(rng, p.arena);
  }
  for (let i = 0; i < p.nToxin; i++) {
    toxinX[i] = placer(rng, p.arena);
    toxinY[i] = placer(rng, p.arena);
  }
  return {
    t: 0,
    x: 0,
    y: 0,
    hx: 1, // cap vers +x, équivalent de l'ancien heading = 0
    hy: 0,
    energy: p.energyStart,
    alive: true,
    foodX,
    foodY,
    foodCooldown: new Int32Array(p.nFood),
    toxinX,
    toxinY,
    toxinCooldown: new Int32Array(p.nToxin),
    predX: p.arena * 0.8,
    predY: p.arena * 0.8,
    ateFood: 0,
    ateToxin: 0,
    hits: 0,
    deaths: 0,
    lifeTicks: 0,
    lastLifetime: 0,
  };
}

/**
 * Directions centrales des secteurs, construites une fois par nombre de secteurs.
 *
 * Stockées en Float32Array délibérément : l'arrondi f32 efface les écarts inter-moteurs de
 * `Math.cos`/`Math.sin` (mesuré : 6,94 % des tirages diffèrent en double précision entre V8 et
 * JSC, 0 sur 10⁷ survivent à l'arrondi f32). La construction a lieu hors du chemin par tick.
 */
const CENTRES = new Map<number, { cx: Float32Array; cy: Float32Array }>();
function centres(secteurs: number): { cx: Float32Array; cy: Float32Array } {
  let c = CENTRES.get(secteurs);
  if (c === undefined) {
    const cx = new Float32Array(secteurs);
    const cy = new Float32Array(secteurs);
    for (let k = 0; k < secteurs; k++) {
      const a = (2 * Math.PI * k) / secteurs;
      cx[k] = Math.cos(a);
      cy[k] = Math.sin(a);
    }
    c = { cx, cy };
    CENTRES.set(secteurs, c);
  }
  return c;
}

/**
 * Secteur d'une direction (rx, ry) exprimée dans le repère de l'organisme.
 *
 * On retient le secteur dont la direction centrale maximise le produit scalaire. C'est
 * strictement équivalent à `round(atan2(ry, rx) / pas)` — le secteur le plus proche
 * angulairement est celui de plus grand cosinus d'écart — mais sans `atan2`. L'échelle de
 * (rx, ry) n'intervient pas : elle est positive et multiplie tous les produits de la même façon.
 *
 * Le secteur 0 reste centré sur « droit devant ».
 */
export function secteurDe(rx: number, ry: number, secteurs: number): number {
  const { cx, cy } = centres(secteurs);
  let best = 0;
  let bestDot = rx * cx[0] + ry * cy[0];
  for (let k = 1; k < secteurs; k++) {
    const d = rx * cx[k] + ry * cy[k];
    if (d > bestDot) {
      bestDot = d;
      best = k;
    }
  }
  return best;
}

/**
 * Dépose une intensité dans le secteur du gisement, avec un léger étalement sur les voisins.
 * Codage par population : pas de seuil binaire, l'intensité décroît avec la distance.
 */
function deposer(
  canal: Float32Array,
  rx: number,
  ry: number,
  intensite: number,
  secteurs: number,
): void {
  const idx = secteurDe(rx, ry, secteurs);
  const gauche = (idx + secteurs - 1) % secteurs;
  const droite = (idx + 1) % secteurs;
  if (intensite > canal[idx]) canal[idx] = intensite;
  const flanc = intensite * 0.5;
  if (flanc > canal[gauche]) canal[gauche] = flanc;
  if (flanc > canal[droite]) canal[droite] = flanc;
}

/**
 * Direction du point (px, py) dans le repère de l'organisme, et sa distance.
 *
 * (rx, ry) est le vecteur organisme→point tourné de −cap : une rotation, donc quatre
 * multiplications. Remplace `atan2` ET `hypot` en un seul passage.
 */
function relatif(
  w: WorldState,
  px: number,
  py: number,
): { rx: number; ry: number; d: number } {
  const dx = px - w.x;
  const dy = py - w.y;
  return {
    rx: dx * w.hx + dy * w.hy,
    ry: dy * w.hx - dx * w.hy,
    d: Math.sqrt(dx * dx + dy * dy),
  };
}

/** Distance euclidienne. `Math.sqrt` est exactement spécifié, `Math.hypot` ne l'est pas. */
function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Direction aléatoire uniforme, sans trigonométrie : tirage par rejet dans le disque unité,
 * puis normalisation. Consomme un nombre variable d'appels RNG (espérance 4/π ≈ 1,27 paires).
 */
function directionAleatoire(rng: RNG): { dx: number; dy: number } {
  for (;;) {
    const u = rng() * 2 - 1;
    const v = rng() * 2 - 1;
    const q = u * u + v * v;
    if (q > 1e-12 && q <= 1) {
      const inv = 1 / Math.sqrt(q);
      return { dx: u * inv, dy: v * inv };
    }
  }
}

function emettre(
  canal: Float32Array,
  w: WorldState,
  xs: Float32Array,
  ys: Float32Array,
  cd: Int32Array,
  portee: number,
  secteurs: number,
): void {
  for (let i = 0; i < xs.length; i++) {
    if (cd[i] > 0) continue; // consommée : elle ne sent plus rien
    const r = relatif(w, xs[i], ys[i]);
    if (r.d >= portee) continue;
    deposer(canal, r.rx, r.ry, 1 - r.d / portee, secteurs);
  }
}

/** Ce que l'organisme perçoit à cet instant. */
export function sense(w: WorldState, p: WorldParams): Sensation {
  const food = new Float32Array(SECTEURS_OLF);
  const toxin = new Float32Array(SECTEURS_OLF);
  const alarm = new Float32Array(SECTEURS_ALARM);
  const soma = new Float32Array(SECTEURS_SOMA);

  // Nourriture et toxine : même fonction, même portée, canaux distincts.
  emettre(food, w, w.foodX, w.foodY, w.foodCooldown, p.olfRange, SECTEURS_OLF);
  emettre(toxin, w, w.toxinX, w.toxinY, w.toxinCooldown, p.olfRange, SECTEURS_OLF);

  const rp = relatif(w, w.predX, w.predY);
  if (rp.d < p.alarmRange) {
    deposer(alarm, rp.rx, rp.ry, 1 - rp.d / p.alarmRange, SECTEURS_ALARM);
  }

  // Somesthésie : les quatre murs, vus comme des contacts à portée courte.
  const contact = p.foodRadius * 2;
  const murs: Array<[number, number]> = [
    [p.arena, w.y],
    [-p.arena, w.y],
    [w.x, p.arena],
    [w.x, -p.arena],
  ];
  for (const [mx, my] of murs) {
    const r = relatif(w, mx, my);
    if (r.d >= contact) continue;
    deposer(soma, r.rx, r.ry, 1 - r.d / contact, SECTEURS_SOMA);
  }

  const energy = Math.max(0, Math.min(1, w.energy / p.energyMax));
  return { food, toxin, alarm, soma, energy };
}

function clamp(v: number, borne: number): number {
  return v < -borne ? -borne : v > borne ? borne : v;
}

/**
 * Un tick de monde. Ordre : action → métabolisme → collisions → réapparitions → mort.
 * Une seule `event` est renvoyée par tick, priorité DEATH > PREDATOR > TOXIN > FOOD ; la
 * récompense, elle, cumule tout ce qui s'est produit.
 */
export function stepWorld(
  w: WorldState,
  p: WorldParams,
  action: MotorAction,
  rng: RNG,
): WorldStep {
  // 1) Action. Tourner = appliquer une rotation au vecteur de cap ; avancer = le suivre.
  let bouge = false;
  if (action === "GAUCHE" || action === "DROITE") {
    const s = action === "GAUCHE" ? p.turnSin : -p.turnSin;
    const nx = w.hx * p.turnCos - w.hy * s;
    const ny = w.hx * s + w.hy * p.turnCos;
    // Renormalisation. Pour la paire actuelle, turnCos² + turnSin² vaut exactement 1 et la
    // norme ne dérive pas (mesuré : 1,00000000000 après 20 000 rotations). C'est une propriété
    // de CES deux littéraux, pas du procédé : changer l'angle de virage la perdrait. Le coût
    // est d'une racine et de deux divisions par virage, toutes deux exactement spécifiées.
    const inv = 1 / Math.sqrt(nx * nx + ny * ny);
    w.hx = nx * inv;
    w.hy = ny * inv;
  } else if (action === "AVANCER") {
    w.x = clamp(w.x + w.hx * p.stepLen, p.arena);
    w.y = clamp(w.y + w.hy * p.stepLen, p.arena);
    bouge = true;
  }

  // 2) Métabolisme : bouger coûte, donc « s'arrêter » est une action utile.
  w.energy -= bouge ? p.metabMove : p.metabRest;

  let reward = 0;
  let event: WorldEventKind | null = null;

  // 3) Collisions avec les pastilles.
  for (let i = 0; i < p.nFood; i++) {
    if (w.foodCooldown[i] > 0) continue;
    if (distance(w.foodX[i], w.foodY[i], w.x, w.y) < p.foodRadius) {
      w.energy = Math.min(p.energyMax, w.energy + p.gainFood);
      reward += p.rFood;
      w.ateFood++;
      w.foodCooldown[i] = p.respawnEvery;
      event = "FOOD";
    }
  }
  for (let i = 0; i < p.nToxin; i++) {
    if (w.toxinCooldown[i] > 0) continue;
    if (distance(w.toxinX[i], w.toxinY[i], w.x, w.y) < p.foodRadius) {
      w.energy -= p.lossToxin;
      reward += p.rToxin;
      w.ateToxin++;
      w.toxinCooldown[i] = p.respawnEvery;
      event = "TOXIN";
    }
  }

  // 4) Prédateur : poursuite sous le rayon de détection, dérive lente au-delà.
  const dPred = distance(w.predX, w.predY, w.x, w.y);
  if (dPred < p.predatorSense && dPred > 1e-6) {
    w.predX += ((w.x - w.predX) / dPred) * p.predatorSpeed;
    w.predY += ((w.y - w.predY) / dPred) * p.predatorSpeed;
  } else {
    const dir = directionAleatoire(rng);
    w.predX = clamp(w.predX + dir.dx * p.predatorSpeed * 0.4, p.arena);
    w.predY = clamp(w.predY + dir.dy * p.predatorSpeed * 0.4, p.arena);
  }
  if (distance(w.predX, w.predY, w.x, w.y) < p.predatorContact) {
    w.energy -= p.lossPredator;
    reward += p.rPredator;
    w.hits++;
    event = "PREDATOR";
    // Le prédateur recule après avoir frappé, sinon il vide l'organisme en quelques ticks.
    const dir = directionAleatoire(rng);
    w.predX = clamp(w.x + dir.dx * p.predatorSense, p.arena);
    w.predY = clamp(w.y + dir.dy * p.predatorSense, p.arena);
  }

  // 5) Réapparitions.
  for (let i = 0; i < p.nFood; i++) if (w.foodCooldown[i] > 0) w.foodCooldown[i]--;
  for (let i = 0; i < p.nToxin; i++) if (w.toxinCooldown[i] > 0) w.toxinCooldown[i]--;

  w.t++;
  w.lifeTicks++;

  // 6) Mort : réapparition au centre, CERVEAU CONSERVÉ. L'apprentissage est continu sur la
  // vie entière de l'agent ; c'est la durée de vie qui est la mesure du progrès.
  let died = false;
  if (w.energy <= 0) {
    died = true;
    event = "DEATH";
    w.deaths++;
    w.lastLifetime = w.lifeTicks;
    w.lifeTicks = 0;
    w.x = 0;
    w.y = 0;
    w.hx = 1;
    w.hy = 0;
    w.energy = p.energyStart;
  }

  return { reward, event, died };
}
