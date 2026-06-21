"use client";

import { useEffect, useRef, useState } from "react";
import { Area, AreaChart, Tooltip, YAxis } from "recharts";
import type { HistoryPoint } from "@/lib/types";

interface Props {
  history: HistoryPoint[];
  colors: { total: string; excited: string };
}

const HEIGHT = 130;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as HistoryPoint;
  return (
    <div className="rounded-md border border-white/10 bg-black/80 px-2.5 py-1.5 font-mono text-[11px] backdrop-blur">
      <div className="text-white/40">itération {p.generation}</div>
      <div className="text-cyan-300">{p.excited} excités</div>
      <div className="text-violet-300">{p.total} vivants</div>
    </div>
  );
}

export function PopulationChart({ history, colors }: Props) {
  // Largeur mesurée → on passe des dimensions numériques explicites à recharts
  // (évite l'avertissement « width(-1) » de ResponsiveContainer avant mesure).
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full" style={{ height: HEIGHT }}>
      {width > 0 && (
        <AreaChart
          width={width}
          height={HEIGHT}
          data={history}
          margin={{ top: 6, right: 2, left: 2, bottom: 0 }}
        >
          <defs>
            <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.total} stopOpacity={0.5} />
              <stop offset="100%" stopColor={colors.total} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradActive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.excited} stopOpacity={0.55} />
              <stop offset="100%" stopColor={colors.excited} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.12)" }} />
          <Area
            type="monotone"
            dataKey="total"
            stroke={colors.total}
            strokeWidth={1.5}
            fill="url(#gradTotal)"
            isAnimationActive={false}
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="excited"
            stroke={colors.excited}
            strokeWidth={1.5}
            fill="url(#gradActive)"
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      )}
    </div>
  );
}
