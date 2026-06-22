"use client";

import { motion } from "framer-motion";
import type { ThemeCanvas } from "@/lib/themes";

// Positions en X des ticks t … t+4 sur le viewBox 320×120
const TICKS = [0, 1, 2, 3, 4];
const X_START = 20;
const X_STEP = 65; // espacement entre ticks
const AXIS_Y = 80;
const TOKEN_Y = 48;

// Durée totale du cycle d'animation en secondes
const DURATION = 3;
const REPEAT_DELAY = 0.8;

export function CreditWallDiagram({ theme }: { theme: ThemeCanvas }): React.JSX.Element {
  const traceWidth = X_STEP * 4; // de t à t+4 = 4 * 65 = 260

  return (
    <figure className="rounded-2xl border border-white/[0.08] bg-black/30 p-5">
      <svg
        viewBox="0 0 320 120"
        className="w-full"
        role="img"
        aria-label="Frise temporelle : une action au temps t émet une trace d'éligibilité qui décroît jusqu'en t+4, où la récompense arrivant crédite l'action."
      >
        {/* Axe horizontal du temps */}
        <line
          x1={X_START}
          y1={AXIS_Y}
          x2={X_START + X_STEP * 4}
          y2={AXIS_Y}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1"
        />

        {/* Ticks et étiquettes t, t+1, …, t+4 */}
        {TICKS.map((t) => {
          const x = X_START + t * X_STEP;
          return (
            <g key={t}>
              <line
                x1={x}
                y1={AXIS_Y - 4}
                x2={x}
                y2={AXIS_Y + 4}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="1"
              />
              <text
                x={x}
                y={AXIS_Y + 16}
                fill="rgba(255,255,255,0.4)"
                fontSize="9"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {t === 0 ? "t" : `t+${t}`}
              </text>
            </g>
          );
        })}

        {/* Barre de trace d'éligibilité : s'élargit de t à t+4 puis décroît en opacité */}
        <motion.rect
          x={X_START}
          y={TOKEN_Y - 4}
          height="8"
          rx="4"
          fill={theme.excited}
          initial={{ width: 0, opacity: 0 }}
          animate={{
            width: [0, traceWidth, traceWidth, traceWidth],
            opacity: [0, 0.55, 0.55, 0.1],
          }}
          transition={{
            duration: DURATION,
            times: [0, 0.35, 0.7, 1],
            ease: "easeOut",
            repeat: Infinity,
            repeatDelay: REPEAT_DELAY,
          }}
        />

        {/* Jeton « action » au temps t */}
        <motion.circle
          cx={X_START}
          cy={TOKEN_Y}
          r="7"
          fill={theme.excitedCore}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 1, 0.3],
            scale: [0, 1.2, 1, 1],
          }}
          transition={{
            duration: DURATION,
            times: [0, 0.08, 0.2, 1],
            ease: "easeOut",
            repeat: Infinity,
            repeatDelay: REPEAT_DELAY,
          }}
        />

        {/* Jeton « récompense » au temps t+4 — apparaît en fin de cycle */}
        <motion.circle
          cx={X_START + X_STEP * 4}
          cy={TOKEN_Y}
          r="8"
          fill={theme.event}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0, 0, 1],
            scale: [0, 0, 0, 1.3, 1],
          }}
          transition={{
            duration: DURATION,
            times: [0, 0.5, 0.7, 0.9, 1],
            ease: "easeOut",
            repeat: Infinity,
            repeatDelay: REPEAT_DELAY,
          }}
        />

        {/* Étiquettes « action » et « récompense » */}
        <motion.text
          x={X_START}
          y={TOKEN_Y - 16}
          fill={theme.excitedCore}
          fontSize="8"
          textAnchor="middle"
          fontFamily="monospace"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.8, 0.8, 0.2] }}
          transition={{
            duration: DURATION,
            times: [0, 0.1, 0.7, 1],
            repeat: Infinity,
            repeatDelay: REPEAT_DELAY,
          }}
        >
          action
        </motion.text>

        <motion.text
          x={X_START + X_STEP * 4}
          y={TOKEN_Y - 18}
          fill={theme.event}
          fontSize="8"
          textAnchor="middle"
          fontFamily="monospace"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 0, 0.9] }}
          transition={{
            duration: DURATION,
            times: [0, 0.5, 0.7, 1],
            repeat: Infinity,
            repeatDelay: REPEAT_DELAY,
          }}
        >
          récompense
        </motion.text>
      </svg>

      <figcaption className="mt-2 text-center font-mono text-[11px] text-white/40">
        l&apos;action (clair) laisse une trace d&apos;éligibilité qui décline ; quand la récompense
        (coloré) arrive en t+4, la trace encore présente crédite l&apos;action.
      </figcaption>
    </figure>
  );
}
