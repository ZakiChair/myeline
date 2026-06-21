"use client";

// Vue 3D navigable du réseau (WebGL / Three.js via react-force-graph-3d).
// Sphères recolorées à chaque frame selon la phase (excité / réfractaire / repos),
// glow néon via UnrealBloomPass, navigation orbitale (rotation / zoom / pan).
// Importé en ssr:false.

import { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { GraphData, NeuronNode } from "@/lib/types";
import type { ThemeCanvas } from "@/lib/themes";

const W_MAX = 14;
const DYING_MS = 650;
const SPHERE_GEO = new THREE.SphereGeometry(1, 12, 12);

interface Props {
  graphData: GraphData;
  onExcite: (id: number) => void;
  brushMode: boolean;
  fitToken: number;
  theme: ThemeCanvas;
}

type MeshNode = NeuronNode & { __mesh?: THREE.Mesh };

function radiusFor(degree: number): number {
  return Math.min(6, 1.6 + Math.sqrt(degree) * 0.5);
}

export default function NeuralGraph3D({
  graphData,
  onExcite,
  brushMode,
  fitToken,
  theme,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<NeuronNode | null>(null);

  // Refs lues par la boucle d'animation (toujours à jour sans la recréer).
  const dataRef = useRef(graphData);
  dataRef.current = graphData;
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setDims({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Forces : espacement aéré pour la 3D.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-110);
    fg.d3Force("link")?.distance(34);
  }, [dims.width, dims.height]);

  // Recentrage caméra (fit) à la (re)génération et touche F.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const t = window.setTimeout(() => fg.zoomToFit(700, 60), 120);
    return () => window.clearTimeout(t);
  }, [fitToken]);

  // Glow néon : ajoute UnrealBloomPass au compositeur de post-traitement.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || dims.width === 0) return;
    const id = window.setTimeout(() => {
      const composer = fg.postProcessingComposer?.();
      if (!composer) return;
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(dims.width, dims.height),
        1.7, // intensité
        0.7, // rayon
        0.12, // seuil (les couleurs vives débordent, les sombres non)
      );
      composer.addPass(bloom);
    }, 80);
    return () => window.clearTimeout(id);
    // Au montage uniquement : le compositeur est détruit avec le graphe au démontage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims.width === 0]);

  // Boucle d'animation : recolore / redimensionne chaque sphère selon la phase.
  useEffect(() => {
    let raf = 0;
    const tmp = new THREE.Color();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const th = themeRef.current;
      const nodes = dataRef.current.nodes as MeshNode[];
      for (const n of nodes) {
        const mesh = n.__mesh;
        if (!mesh) continue;
        const excited = n.state === 1;
        const refractory = !excited && (n.cooldown ?? 0) > 0;
        const baseR = radiusFor(n.degree || 0);
        let color: string;
        let scale: number;
        if (excited) {
          color = th.excited;
          scale = baseR * (1.2 + 0.16 * Math.sin(now / 300 + n.id));
        } else if (refractory) {
          color = th.refractory;
          scale = baseR * 0.9;
        } else {
          color = th.rest;
          scale = baseR * 0.7;
        }
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.color.set(tmp.set(color));
        if (n.dyingAt !== undefined) {
          mat.transparent = true;
          mat.opacity = Math.max(0, 1 - (now - n.dyingAt) / DYING_MS);
        } else if (mat.opacity !== 1) {
          mat.opacity = 1;
        }
        mesh.scale.setScalar(scale);
      }
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  const nodeThreeObject = useCallback((node: NeuronNode) => {
    const mat = new THREE.MeshBasicMaterial({ color: "#000000" });
    const mesh = new THREE.Mesh(SPHERE_GEO, mat);
    (node as MeshNode).__mesh = mesh;
    return mesh;
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkColor = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (link: any) => {
      const active = link.source?.state === 1 || link.target?.state === 1;
      return active ? themeRef.current.linkActive : themeRef.current.linkIdle;
    },
    [],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkWidth = useCallback((link: any) => {
    const active = link.source?.state === 1 || link.target?.state === 1;
    return active ? 0.6 : 0.2;
  }, []);

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
        <ForceGraph3D
          ref={fgRef}
          width={dims.width}
          height={dims.height}
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          graphData={graphData as any}
          backgroundColor={theme.bg}
          showNavInfo={false}
          /* controlType orbit : rotation glisser, zoom molette, pan clic droit. */
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...({ controlType: "orbit" } as any)}
          nodeThreeObject={nodeThreeObject}
          nodeRelSize={4}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkOpacity={0.32}
          linkResolution={2}
          enableNodeDrag={false}
          d3VelocityDecay={0.34}
          d3AlphaDecay={0.025}
          cooldownTime={15000}
          onNodeClick={(n: NeuronNode) => onExcite(n.id)}
          onNodeHover={(n: NeuronNode | null) => {
            setHover(n ?? null);
            if (n && brushMode) onExcite(n.id);
          }}
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
