// Sprites de halo pré-rendus (canvas offscreen) pour un rendu de glow performant.
// On dessine ces sprites via drawImage + composition « lighter » (additive) au
// lieu de recalculer un dégradé radial par nœud et par frame (~10x moins coûteux,
// et bien moins cher que ctx.shadowBlur).

const cache = new Map<string, HTMLCanvasElement>();

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Retourne (et met en cache) un sprite de halo radial pour une couleur donnée. */
export function getGlowSprite(color: string, size = 128): HTMLCanvasElement {
  const key = `${color}_${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, hexToRgba(color, 1));
  grad.addColorStop(0.18, hexToRgba(color, 0.55));
  grad.addColorStop(0.45, hexToRgba(color, 0.16));
  grad.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  cache.set(key, canvas);
  return canvas;
}
