"use client";

// Cerveau 3D du lot 2 : un THREE.Points par neurone, shader custom — couleur de
// base par région, blanchiment proportionnel à l'activité, taille modulée,
// blending additif sans test de profondeur. La caméra est orbitale. La couche
// d'arêtes (sous-échantillon ~80 000) se monte à la demande.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RegionId } from "@/sim/params";
import type { RegionInfo } from "@/worker/protocol";
import type { RefObject } from "react";

/** Couleur par région : identité biologique, pas décoration — fixe, hors thème. */
const REGION_COLORS: Record<RegionId, number> = {
  OLF_FOOD: 0x3ddc84,
  OLF_TOXIN: 0xb06bff,
  ALARM: 0xff5c5c,
  SOMA: 0xffb84d,
  INTERO: 0x4dd8ff,
  CORTEX: 0x3a4d8f,
  MOTOR: 0xf5f5f5,
  VTA: 0xff5cf2,
  // Voie olfactive (lot 1 de la refonte).
  GLOM: 0x3ddc84,
  KC: 0x3a4d8f,
  APL: 0xff5c5c,
  GUST: 0xffb84d,
  MBON: 0xf5f5f5,
  NOCI: 0xff5c5c,
  SER: 0xffb84d,
};

const VERT = /* glsl */ `
  attribute float aActivity;
  attribute vec3 aColor;
  uniform float uSize;
  varying vec3 vColor;
  varying float vAct;
  void main() {
    vAct = aActivity;
    // Activité → blanchiment : la lumière EST la décharge, pas un post-effet.
    vColor = mix(aColor, vec3(1.0), aActivity * 0.85);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * (1.0 + aActivity * 1.6) * (120.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAct;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.1, r) * (0.30 + 0.70 * vAct);
    gl_FragColor = vec4(vColor, a);
  }
`;

interface Props {
  positions: Float32Array;
  regions: RegionInfo[];
  activityRef: RefObject<Float32Array | null>;
  /** Paires source→cible reçues du worker ; affichées quand showEdges. */
  edges: Uint32Array | null;
  showEdges: boolean;
}

export default function BrainView({ positions, regions, activityRef, edges, showEdges }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    edgeLines: THREE.LineSegments | null;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const n = positions.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const colors = new Float32Array(3 * n);
    const tmp = new THREE.Color();
    for (const r of regions) {
      tmp.set(REGION_COLORS[r.id]);
      for (let i = r.start; i < r.start + r.count; i++) {
        colors[3 * i] = tmp.r;
        colors[3 * i + 1] = tmp.g;
        colors[3 * i + 2] = tmp.b;
      }
    }
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

    const act = new Float32Array(n);
    const actAttr = new THREE.BufferAttribute(act, 1);
    actAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aActivity", actAttr);

    // La dalle fait ~l de côté : on cadre depuis trois dalle-demi.
    geo.computeBoundingSphere();
    const rayon = geo.boundingSphere?.radius ?? 40;
    camera.position.set(rayon * 1.9, rayon * 1.2, rayon * 1.9);
    controls.update();

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uSize: { value: 2.4 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, material);
    scene.add(points);
    sceneRef.current = { scene, edgeLines: null };

    const parent = canvas.parentElement!;
    const resize = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const courante = activityRef.current;
      if (courante && courante.length === n) {
        act.set(courante);
        actAttr.needsUpdate = true;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      material.dispose();
      geo.dispose();
      renderer.dispose();
      sceneRef.current = null;
    };
    // positions et regions sont figées pour la durée d'une session (reset → nouveau tableau).
  }, [positions, regions, activityRef]);

  // Surcouche d'arêtes : construite quand les paires arrivent, montrée sur bascule.
  useEffect(() => {
    const holder = sceneRef.current;
    if (!holder) return;
    const { scene } = holder;
    if (holder.edgeLines) {
      scene.remove(holder.edgeLines);
      holder.edgeLines.geometry.dispose();
      (holder.edgeLines.material as THREE.Material).dispose();
      holder.edgeLines = null;
    }
    if (!showEdges || !edges || edges.length === 0) return;

    const m = edges.length / 2;
    const pos = new Float32Array(m * 6);
    for (let k = 0; k < m; k++) {
      const a = edges[2 * k];
      const b = edges[2 * k + 1];
      pos[6 * k] = positions[3 * a];
      pos[6 * k + 1] = positions[3 * a + 1];
      pos[6 * k + 2] = positions[3 * a + 2];
      pos[6 * k + 3] = positions[3 * b];
      pos[6 * k + 4] = positions[3 * b + 1];
      pos[6 * k + 5] = positions[3 * b + 2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: 0x5a70b8,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(lines);
    holder.edgeLines = lines;
  }, [edges, showEdges, positions]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}
