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
  heading: number;
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
    heading: 0,
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
 * Dépose une intensité dans le secteur du gisement, avec un léger étalement sur les voisins.
 * Codage par population : pas de seuil binaire, l'intensité décroît avec la distance.
 */
function deposer(
  canal: Float32Array,
  angleRelatif: number,
  intensite: number,
  secteurs: number,
): void {
  const pas = (2 * Math.PI) / secteurs;
  // Le secteur 0 est centré sur « droit devant ».
  const b = Math.round(angleRelatif / pas);
  const idx = ((b % secteurs) + secteurs) % secteurs;
  const gauche = (idx + secteurs - 1) % secteurs;
  const droite = (idx + 1) % secteurs;
  if (intensite > canal[idx]) canal[idx] = intensite;
  const flanc = intensite * 0.5;
  if (flanc > canal[gauche]) canal[gauche] = flanc;
  if (flanc > canal[droite]) canal[droite] = flanc;
}

/** Angle du point (px, py) relativement au cap de l'organisme, dans (-π, π]. */
function angleRelatif(w: WorldState, px: number, py: number): number {
  let a = Math.atan2(py - w.y, px - w.x) - w.heading;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
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
    const d = Math.hypot(xs[i] - w.x, ys[i] - w.y);
    if (d >= portee) continue;
    deposer(canal, angleRelatif(w, xs[i], ys[i]), 1 - d / portee, secteurs);
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

  const dPred = Math.hypot(w.predX - w.x, w.predY - w.y);
  if (dPred < p.alarmRange) {
    deposer(alarm, angleRelatif(w, w.predX, w.predY), 1 - dPred / p.alarmRange, SECTEURS_ALARM);
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
    const d = Math.hypot(mx - w.x, my - w.y);
    if (d >= contact) continue;
    deposer(soma, angleRelatif(w, mx, my), 1 - d / contact, SECTEURS_SOMA);
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
  // 1) Action.
  let bouge = false;
  if (action === "GAUCHE") w.heading += p.turnStep;
  else if (action === "DROITE") w.heading -= p.turnStep;
  else if (action === "AVANCER") {
    w.x = clamp(w.x + Math.cos(w.heading) * p.stepLen, p.arena);
    w.y = clamp(w.y + Math.sin(w.heading) * p.stepLen, p.arena);
    bouge = true;
  }

  // 2) Métabolisme : bouger coûte, donc « s'arrêter » est une action utile.
  w.energy -= bouge ? p.metabMove : p.metabRest;

  let reward = 0;
  let event: WorldEventKind | null = null;

  // 3) Collisions avec les pastilles.
  for (let i = 0; i < p.nFood; i++) {
    if (w.foodCooldown[i] > 0) continue;
    if (Math.hypot(w.foodX[i] - w.x, w.foodY[i] - w.y) < p.foodRadius) {
      w.energy = Math.min(p.energyMax, w.energy + p.gainFood);
      reward += p.rFood;
      w.ateFood++;
      w.foodCooldown[i] = p.respawnEvery;
      event = "FOOD";
    }
  }
  for (let i = 0; i < p.nToxin; i++) {
    if (w.toxinCooldown[i] > 0) continue;
    if (Math.hypot(w.toxinX[i] - w.x, w.toxinY[i] - w.y) < p.foodRadius) {
      w.energy -= p.lossToxin;
      reward += p.rToxin;
      w.ateToxin++;
      w.toxinCooldown[i] = p.respawnEvery;
      event = "TOXIN";
    }
  }

  // 4) Prédateur : poursuite sous le rayon de détection, dérive lente au-delà.
  const dPred = Math.hypot(w.predX - w.x, w.predY - w.y);
  if (dPred < p.predatorSense && dPred > 1e-6) {
    w.predX += ((w.x - w.predX) / dPred) * p.predatorSpeed;
    w.predY += ((w.y - w.predY) / dPred) * p.predatorSpeed;
  } else {
    const ang = rng() * 2 * Math.PI;
    w.predX = clamp(w.predX + Math.cos(ang) * p.predatorSpeed * 0.4, p.arena);
    w.predY = clamp(w.predY + Math.sin(ang) * p.predatorSpeed * 0.4, p.arena);
  }
  if (Math.hypot(w.predX - w.x, w.predY - w.y) < p.predatorContact) {
    w.energy -= p.lossPredator;
    reward += p.rPredator;
    w.hits++;
    event = "PREDATOR";
    // Le prédateur recule après avoir frappé, sinon il vide l'organisme en quelques ticks.
    const a = rng() * 2 * Math.PI;
    w.predX = clamp(w.x + Math.cos(a) * p.predatorSense, p.arena);
    w.predY = clamp(w.y + Math.sin(a) * p.predatorSense, p.arena);
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
    w.heading = 0;
    w.energy = p.energyStart;
  }

  return { reward, event, died };
}
