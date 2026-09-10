"use client";

// Le monde vu de dessus — canvas 2D, lisibilité d'abord. L'organisme (disque +
// cap), la nourriture (vert), la toxine (violet), le prédateur (rouge) et le
// niveau d'énergie (anneau). Tout est lu depuis l'instantané du worker à 60 fps.

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { VieSnapshot } from "@/sim/snapshot";

interface Props {
  snapRef: RefObject<VieSnapshot | null>;
}

const F = {
  food: "#3ddc84",
  foodOff: "rgba(61,220,132,0.18)",
  toxin: "#b06bff",
  toxinOff: "rgba(176,107,255,0.18)",
  pred: "#ff5c5c",
  org: "#f5f5f5",
  energy: "#ffd54d",
  wall: "rgba(255,255,255,0.12)",
};

export default function WorldView({ snapRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const parent = canvas.parentElement!;

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const snap = snapRef.current;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const dpr = Math.min(window.devicePixelRatio, 2);
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!snap) return;

      const arena = snap.world.arena;
      const echelle = Math.min(w, h) / (2 * arena * 1.08);
      const px = (x: number) => w / 2 + x * echelle;
      const py = (y: number) => h / 2 - y * echelle;
      const monde = snap.world;

      // Murs de l'arène.
      ctx.strokeStyle = F.wall;
      ctx.lineWidth = 1;
      ctx.strokeRect(px(-arena), py(arena), 2 * arena * echelle, 2 * arena * echelle);

      // Nourriture / toxine : atténuées pendant leur réapparition.
      for (let i = 0; i < monde.foodX.length; i++) {
        const cd = monde.foodCd[i] > 0;
        ctx.fillStyle = cd ? F.foodOff : F.food;
        ctx.beginPath();
        ctx.arc(px(monde.foodX[i]), py(monde.foodY[i]), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < monde.toxinX.length; i++) {
        const cd = monde.toxinCd[i] > 0;
        ctx.fillStyle = cd ? F.toxinOff : F.toxin;
        ctx.beginPath();
        ctx.arc(px(monde.toxinX[i]), py(monde.toxinY[i]), 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Prédateur : losange + halo de danger.
      ctx.fillStyle = F.pred;
      ctx.beginPath();
      ctx.moveTo(px(monde.predX), py(monde.predY) - 6);
      ctx.lineTo(px(monde.predX) + 5, py(monde.predY));
      ctx.lineTo(px(monde.predX), py(monde.predY) + 6);
      ctx.lineTo(px(monde.predX) - 5, py(monde.predY));
      ctx.fill();

      // Organisme : disque + trait de cap + anneau d'énergie.
      const ox = px(monde.x);
      const oy = py(monde.y);
      ctx.globalAlpha = monde.alive ? 1 : 0.25;
      ctx.fillStyle = F.org;
      ctx.beginPath();
      ctx.arc(ox, oy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = F.org;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + monde.hx * 11, oy - monde.hy * 11);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Énergie : arc de 0 à 2π.
      ctx.strokeStyle = F.energy;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ox, oy, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, monde.energy));
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [snapRef]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}
