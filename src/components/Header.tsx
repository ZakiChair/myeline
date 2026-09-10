"use client";

import Link from "next/link";
import { Activity, BookOpen, Boxes, Brain, Bug, Sparkle } from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export type AppMode = "vie" | "studio" | "scale" | "creature" | "organisme";

interface Props {
  themeId: string;
  onThemeChange: (id: string) => void;
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/60">
      {children}
    </kbd>
  );
}

export function Header({ themeId, onThemeChange, mode, onModeChange }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-5">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
              style={{ background: "var(--a1)" }}
            />
            <span
              className="relative inline-flex h-3 w-3 rounded-full"
              style={{
                background: "var(--a1)",
                boxShadow: "0 0 14px 3px color-mix(in srgb, var(--a1) 70%, transparent)",
              }}
            />
          </span>
          <h1
            className="bg-clip-text text-lg font-semibold tracking-tight text-transparent"
            style={{ backgroundImage: "linear-gradient(90deg, var(--a1), #ffffff, var(--a2))" }}
          >
            Myéline
          </h1>
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/30 p-0.5">
          <button
            type="button"
            onClick={() => onModeChange("vie")}
            aria-pressed={mode === "vie"}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition ${
              mode === "vie" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
            }`}
          >
            <Activity size={12} />
            Vie
          </button>
          <button
            type="button"
            onClick={() => onModeChange("studio")}
            aria-pressed={mode === "studio"}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition ${
              mode === "studio" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
            }`}
          >
            <Sparkle size={12} />
            Studio
          </button>
          <button
            type="button"
            onClick={() => onModeChange("scale")}
            aria-pressed={mode === "scale"}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition ${
              mode === "scale" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
            }`}
          >
            <Boxes size={12} />
            Échelle
          </button>
          <button
            type="button"
            onClick={() => onModeChange("creature")}
            aria-pressed={mode === "creature"}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition ${
              mode === "creature" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
            }`}
          >
            <Bug size={12} />
            Créature
          </button>
          <button
            type="button"
            onClick={() => onModeChange("organisme")}
            aria-pressed={mode === "organisme"}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition ${
              mode === "organisme" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/80"
            }`}
          >
            <Brain size={12} />
            Organisme
          </button>
        </div>
      </div>

      <div className="hidden items-center gap-2 font-mono text-[11px] text-white/30 xl:flex">
        <Kbd>Espace</Kbd>
        <span>play</span>
        <Kbd>S</Kbd>
        <span>step</span>
        <Kbd>R</Kbd>
        <span>reset</span>
        <Kbd>F</Kbd>
        <span>fit</span>
      </div>

      <div className="flex items-center gap-3">
        <ThemeSwitcher themeId={themeId} onThemeChange={onThemeChange} />
        <Link
          href="/theorie"
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/70 transition hover:bg-white/5 hover:text-white"
        >
          <BookOpen size={14} />
          <span className="hidden sm:inline">Théorie</span>
        </Link>
      </div>
    </header>
  );
}
