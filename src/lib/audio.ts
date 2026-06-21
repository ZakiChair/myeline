// Audio très subtil via la Web Audio API. Désactivé par défaut ; le contexte
// audio n'est créé qu'après activation par l'utilisateur (geste requis par les
// navigateurs). Les blips sont throttlés pour éviter toute cacophonie.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;
let lastPlay = 0;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setAudioEnabled(on: boolean): void {
  enabled = on;
  if (on) ensureContext();
}

export function isAudioEnabled(): boolean {
  return enabled;
}

function blip(
  freqStart: number,
  freqEnd: number,
  dur: number,
  peak: number,
): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freqStart, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** Joue un blip représentatif des naissances / morts du tick (throttlé). */
export function reportTick(births: number, deaths: number): void {
  if (!enabled || !ctx) return;
  const now = performance.now();
  if (now - lastPlay < 55) return;
  lastPlay = now;
  if (births > 0) blip(440, 820, 0.16, 0.05); // ton montant : naissance
  if (deaths > 0) blip(280, 110, 0.2, 0.04); // ton descendant : mort
}
