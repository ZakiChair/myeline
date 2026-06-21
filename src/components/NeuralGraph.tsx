"use client";

// Rendu du réseau via ForceGraph2D + canvas custom. Trois phases excitables
// (excité / réfractaire / repos). Couleurs pilotées par le thème actif.
// Importé en ssr:false.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { DroppedEdgeGhost, GraphData, NeuronNode } from "@/lib/types";
import type { ThemeCanvas } from "@/lib/themes";
import { getGlowSprite } from "@/lib/glow";

const BIRTH_MS = 650;
const DYING_MS = 650;
const DROP_FADE_MS = 520;
const W_MAX = 14;

interface Props {
  graphData: GraphData;
  onExcite: (id: number) => void;
  brushMode: boolean;
  fitToken: number;
  droppedEdges: RefObject<DroppedEdgeGhost[]>;
  theme: ThemeCanvas;
}

function radiusFor(degree: number): number {
  return Math.min(9, 2.4 + Math.sqrt(degree) * 0.75);
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function NeuralGraph({
  graphData,
  onExcite,
  brushMode,
  fitToken,
  droppedEdges,
  theme,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<NeuronNode | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setDims({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-95).distanceMax(440);
    fg.d3Force("link")?.distance(36).strength(0.5);
  }, [dims.width, dims.height]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const t = window.setTimeout(() => fg.zoomToFit(600, 80), 90);
    return () => window.clearTimeout(t);
  }, [fitToken]);

  const lod = graphData.nodes.length > 600;

  const drawNode = useCallback(
    (node: NeuronNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const now = performance.now();
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const baseR = radiusFor(node.degree || 0);
      const excited = node.state === 1;
      const refractory = !excited && (node.cooldown ?? 0) > 0;

      let alpha = 1;
      if (node.dyingAt !== undefined) {
        const t = (now - node.dyingAt) / DYING_MS;
        if (t >= 1) return;
        alpha = 1 - t;
      }

      const vit = Math.max(0, Math.min(20, node.vitality ?? 0)) / 20;

      let color: string;
      let glowAlpha: number;
      let glowMul: number;
      if (excited) {
        color = theme.excited;
        glowAlpha = theme.glowExcitedAlpha;
        glowMul = theme.glowExcitedMul;
      } else if (refractory) {
        color = theme.refractory;
        glowAlpha = 0.2;
        glowMul = 2.1;
      } else {
        color = theme.rest;
        glowAlpha = theme.glowRestAlpha + vit * 0.12;
        glowMul = 1.8;
      }
      if (lod) glowAlpha *= 0.7;
      const glowR = baseR * glowMul;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = glowAlpha * alpha;
      ctx.drawImage(getGlowSprite(color), x - glowR, y - glowR, glowR * 2, glowR * 2);
      ctx.restore();

      if (node.bornAt !== undefined) {
        const t = (now - node.bornAt) / BIRTH_MS;
        if (t < 1) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = (1 - t) * 0.9 * alpha;
          ctx.strokeStyle = theme.event;
          ctx.lineWidth = 1.6 / scale;
          ctx.beginPath();
          ctx.arc(x, y, baseR * (1 + t * 3.4), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, baseR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (excited) {
        ctx.beginPath();
        ctx.arc(x, y, baseR * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = theme.excitedCore;
        ctx.fill();
      }

      if (hover && hover.id === node.id) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1.4 / scale;
        ctx.beginPath();
        ctx.arc(x, y, baseR + 4 / scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    [hover, lod, theme],
  );

  const pointerPaint = useCallback(
    (node: NeuronNode, color: string, ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, radiusFor(node.degree || 0) + 2.5, 0, Math.PI * 2);
      ctx.fill();
    },
    [],
  );

  const linkColor = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (link: any) => {
      const w = (link.weight ?? 5) / W_MAX;
      const excited = link.source?.state === 1 || link.target?.state === 1;
      const a = 0.05 + w * 0.35 + (excited ? 0.18 : 0);
      return hexToRgba(excited ? theme.linkActive : theme.linkIdle, a);
    },
    [theme],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkWidth = useCallback((link: any) => 0.4 + ((link.weight ?? 5) / W_MAX) * 1.5, []);

  const renderPost = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      const ghosts = droppedEdges.current;
      if (!ghosts || ghosts.length === 0) return;
      const now = performance.now();
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1.1 / scale;
      ctx.strokeStyle = theme.event;
      for (const g of ghosts) {
        const t = (now - g.at) / DROP_FADE_MS;
        if (t < 0 || t >= 1) continue;
        ctx.globalAlpha = (1 - t) * 0.5;
        ctx.beginPath();
        ctx.moveTo(g.a.x ?? 0, g.a.y ?? 0);
        ctx.lineTo(g.b.x ?? 0, g.b.y ?? 0);
        ctx.stroke();
      }
      ctx.restore();
    },
    [droppedEdges, theme],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current;
    const tip = tooltipRef.current;
    if (!el || !tip) return;
    const rect = el.getBoundingClientRect();
    tip.style.left = `${e.clientX - rect.left + 16}px`;
    tip.style.top = `${e.clientY - rect.top + 16}px`;
  }, []);

  const phaseLabel = hover
    ? hover.state === 1
      ? "excité"
      : (hover.cooldown ?? 0) > 0
        ? "réfractaire"
        : "repos"
    : "";

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${brushMode ? "cursor-crosshair" : ""}`}
      onMouseMove={handleMouseMove}
    >
      {dims.width > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dims.width}
          height={dims.height}
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          graphData={graphData as any}
          backgroundColor="rgba(0,0,0,0)"
          autoPauseRedraw={false}
          nodeRelSize={4}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={pointerPaint}
          linkColor={linkColor}
          linkWidth={linkWidth}
          onRenderFramePost={renderPost}
          d3VelocityDecay={0.32}
          d3AlphaDecay={0.025}
          cooldownTime={15000}
          warmupTicks={0}
          minZoom={0.35}
          maxZoom={7}
          enableNodeDrag
          onNodeClick={(n: NeuronNode) => onExcite(n.id)}
          onNodeHover={(n: NeuronNode | null) => {
            setHover(n ?? null);
            if (n && brushMode) onExcite(n.id);
          }}
          onBackgroundClick={() => setHover(null)}
        />
      )}

      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-20 hidden rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-xs backdrop-blur-md data-[show=true]:block"
        data-show={hover ? "true" : "false"}
      >
        {hover && (
          <div className="flex flex-col gap-0.5 font-mono">
            <span className="text-white/50">
              neurone <span className="text-[var(--a1)]">#{hover.id}</span>
            </span>
            <span className="text-white/70">
              phase <span className="text-white/90">{phaseLabel}</span>
            </span>
            <span className="text-white/70">
              degré <span className="text-[var(--a2)]">{hover.degree}</span> · vitalité{" "}
              <span className="text-[var(--a3)]">{Math.round(hover.vitality ?? 0)}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
