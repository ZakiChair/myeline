"use client";

import { motion } from "framer-motion";
import type { ThemeCanvas } from "@/lib/themes";

// Quatre nœuds de la boucle organisme, positions en X dans le viewBox 380×150
const NODES = [
  { id: "sentir", label: "Sentir", x: 30, sub: "capteurs" },
  { id: "reservoir", label: "Réservoir", x: 130, sub: "figé · mémoire" },
  { id: "lecteur", label: "Lecteur", x: 230, sub: "appris" },
  { id: "agir", label: "Agir", x: 330, sub: "moteur" },
];

export function OrganismLoopDiagram({ theme }: { theme: ThemeCanvas }): React.JSX.Element {
  return (
    <figure className="rounded-2xl border border-white/[0.08] bg-black/30 p-5">
      <svg
        viewBox="0 0 380 150"
        className="w-full"
        role="img"
        aria-label="Boucle : sentir, réservoir, lecteur appris, agir, puis récompense en retour."
      >
        <defs>
          <marker id="tip" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0 L6 3 L0 6 z" fill="rgba(255,255,255,0.4)" />
          </marker>
        </defs>

        {/* Flèches avant : Sentir → Réservoir → Lecteur → Agir */}
        {[0, 1, 2].map((i) => (
          <line
            key={i}
            x1={NODES[i].x + 24}
            y1="50"
            x2={NODES[i + 1].x - 24}
            y2="50"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="1"
            markerEnd="url(#tip)"
          />
        ))}

        {/* Flèche de retour : Agir → Sentir (récompense) */}
        <path
          d="M330 66 q-150 60 -300 0"
          fill="none"
          stroke={theme.event}
          strokeDasharray="4 3"
          markerEnd="url(#tip)"
          opacity="0.6"
        />
        <text
          x="180"
          y="135"
          fill={theme.event}
          fontSize="9"
          textAnchor="middle"
          fontFamily="monospace"
          opacity="0.8"
        >
          récompense
        </text>

        {/* Nœuds de la boucle */}
        {NODES.map((n, i) => (
          <g key={n.id}>
            {/* Cercle du nœud : le réservoir a un fond léger, le lecteur a un contour coloré */}
            <circle
              cx={n.x}
              cy="50"
              r="22"
              fill={i === 1 ? "rgba(255,255,255,0.04)" : "transparent"}
              stroke={i === 2 ? theme.excited : "rgba(255,255,255,0.3)"}
              strokeWidth="1"
            />
            <text
              x={n.x}
              y="48"
              fill="#fff"
              fontSize="10"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {n.label}
            </text>
            <text
              x={n.x}
              y="62"
              fill="rgba(255,255,255,0.4)"
              fontSize="7.5"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {n.sub}
            </text>
          </g>
        ))}

        {/* Jeton qui circule le long de la boucle */}
        <motion.circle
          r="4"
          fill={theme.excitedCore}
          animate={{ cx: [30, 130, 230, 330], cy: [50, 50, 50, 50] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>

      {/* Légende : seul le lecteur est appris, le corps est scène codée */}
      <figcaption className="mt-2 text-center font-mono text-[11px] text-white/40">
        seul le{" "}
        <span style={{ color: theme.excited }}>lecteur</span> est appris ; le réservoir reste figé.
        le corps et la démarche sont de la <em>scène codée</em>.
      </figcaption>

      {/* Caveat honnêteté : vue continue → nécessité du réservoir non prouvée */}
      <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2 text-[12.5px] text-white/65">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-300/80">
          À ce stade ·{" "}
        </span>
        dans cette tâche la vue est <strong className="text-white/85">continue</strong> : on prouve
        que la politique apprend, pas que le réservoir est <em>nécessaire</em> au fourrage. Rendre
        la vue intermittente (le repère clignote) forcerait la mémoire — c&apos;est l&apos;étape
        qui reste ouverte.
      </p>
    </figure>
  );
}
