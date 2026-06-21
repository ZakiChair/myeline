"use client";

// Rendu « Échelle » : nuage de points GPU (THREE.Points) lisant directement les
// typed-arrays du moteur. Couleur par phase, blending additif (glow néon, pas de
// bloom par-point), navigation orbitale, picking pour le clic = décharge.
// Scalable à ~1M points. Importé en ssr:false.

import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ScaleGraph } from "@/lib/scale-engine";
import type { ThemeCanvas } from "@/lib/themes";

interface Props {
  graphRef: RefObject<ScaleGraph | null>;
  version: number; // bump quand la topologie/le graphe change
  fitToken: number; // recentre la caméra
  theme: ThemeCanvas;
  onExcite: (slot: number) => void;
}

const VERT = `
  attribute float aState;
  uniform vec3 uExcited;
  uniform vec3 uRefractory;
  uniform vec3 uRest;
  uniform float uSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float sizeMult;
    if (aState < 0.0) { vColor = vec3(0.0); vAlpha = 0.0; gl_PointSize = 0.0; gl_Position = projectionMatrix * mv; return; }
    else if (aState > 1.5) { vColor = uRefractory; vAlpha = 0.5; sizeMult = 0.8; }
    else if (aState > 0.5) { vColor = uExcited; vAlpha = 1.0; sizeMult = 1.7; }
    else { vColor = uRest; vAlpha = 0.4; sizeMult = 0.6; }
    gl_PointSize = uSize * sizeMult * (300.0 / max(0.001, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float glow = smoothstep(0.5, 0.0, r);
    gl_FragColor = vec4(vColor * glow, vAlpha * glow);
  }
`;

function boundingRadius(g: ScaleGraph): number {
  let max = 1;
  for (let i = 0; i < g.capacity; i++) {
    if (!g.alive[i]) continue;
    const d = Math.abs(g.posX[i]) + Math.abs(g.posY[i]) + Math.abs(g.posZ[i]);
    if (d > max) max = d;
  }
  return max;
}

export default function NeuralPointCloud({
  graphRef,
  version,
  fitToken,
  theme,
  onExcite,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    geometry: THREE.BufferGeometry;
    material: THREE.ShaderMaterial;
    points: THREE.Points;
    aState: Float32Array;
    builtCapacity: number;
  } | null>(null);
  const [count, setCount] = useState(0);

  // Montage : scène / caméra / renderer / contrôles / points.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const height = el.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 20000);
    camera.position.set(0, 0, 300);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(new THREE.Color(theme.bg), 1);
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.8;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uExcited: { value: new THREE.Color(theme.excited) },
        uRefractory: { value: new THREE.Color(theme.refractory) },
        uRest: { value: new THREE.Color(theme.rest) },
        uSize: { value: 22 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });

    const geometry = new THREE.BufferGeometry();
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);

    stateRef.current = {
      renderer,
      scene,
      camera,
      controls,
      geometry,
      material,
      points,
      aState: new Float32Array(0),
      builtCapacity: -1,
    };

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const s = stateRef.current;
      const g = graphRef.current;
      if (!s || !g) return;

      // (Re)construit la géométrie si la capacité a changé (nouveau graphe).
      if (s.builtCapacity !== g.capacity) {
        const pos = new Float32Array(g.capacity * 3);
        for (let i = 0; i < g.capacity; i++) {
          pos[i * 3] = g.posX[i];
          pos[i * 3 + 1] = g.posY[i];
          pos[i * 3 + 2] = g.posZ[i];
        }
        s.aState = new Float32Array(g.capacity);
        s.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        s.geometry.setAttribute("aState", new THREE.BufferAttribute(s.aState, 1));
        s.builtCapacity = g.capacity;
      }

      // Positions : rafraîchies sur changement de topologie (naissances).
      const posAttr = s.geometry.getAttribute("position") as THREE.BufferAttribute;
      const posArr = posAttr.array as Float32Array;

      // État → couleur (chaque frame, peu coûteux).
      const aState = s.aState;
      for (let i = 0; i < g.capacity; i++) {
        if (!g.alive[i]) {
          aState[i] = -1;
          continue;
        }
        aState[i] = g.state[i] === 1 ? 1 : g.cooldown[i] > 0 ? 2 : 0;
        // garde les positions des nouveau-nés à jour
        posArr[i * 3] = g.posX[i];
        posArr[i * 3 + 1] = g.posY[i];
        posArr[i * 3 + 2] = g.posZ[i];
      }
      (s.geometry.getAttribute("aState") as THREE.BufferAttribute).needsUpdate = true;
      posAttr.needsUpdate = true;

      s.controls.update();
      s.renderer.render(s.scene, s.camera);
    };
    raf = requestAnimationFrame(animate);

    const onResize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      stateRef.current = null;
    };
    // Montage unique.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Couleurs du thème.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    (s.material.uniforms.uExcited.value as THREE.Color).set(theme.excited);
    (s.material.uniforms.uRefractory.value as THREE.Color).set(theme.refractory);
    (s.material.uniforms.uRest.value as THREE.Color).set(theme.rest);
    s.renderer.setClearColor(new THREE.Color(theme.bg), 1);
  }, [theme]);

  // Recentrage caméra (fit) sur (re)génération et touche F.
  useEffect(() => {
    const s = stateRef.current;
    const g = graphRef.current;
    if (!s || !g) return;
    const r = boundingRadius(g);
    const dist = r * 1.5 + 20;
    s.camera.position.set(dist * 0.35, dist * 0.18, dist);
    s.controls.target.set(0, 0, 0);
    s.controls.update();
    setCount(g.count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, version]);

  // Picking : clic = décharge le neurone le plus proche du rayon.
  const handleClick = (e: React.MouseEvent) => {
    const s = stateRef.current;
    const g = graphRef.current;
    const el = containerRef.current;
    if (!s || !g || !el) return;
    const rect = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.params.Points = { threshold: Math.max(2, boundingRadius(g) * 0.02) };
    ray.setFromCamera(ndc, s.camera);
    const hits = ray.intersectObject(s.points);
    for (const h of hits) {
      const idx = h.index;
      if (idx != null && g.alive[idx]) {
        onExcite(idx);
        break;
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      onClick={handleClick}
    >
      <div className="pointer-events-none absolute right-3 bottom-3 font-mono text-[11px] text-white/30">
        {count.toLocaleString("fr-FR")} neurones · point-cloud GPU
      </div>
    </div>
  );
}
