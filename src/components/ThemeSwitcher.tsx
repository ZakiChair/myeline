"use client";

import { THEMES } from "@/lib/themes";

interface Props {
  themeId: string;
  onThemeChange: (id: string) => void;
}

/** Pastilles de sélection de thème, partagées entre le simulateur et la page Théorie. */
export function ThemeSwitcher({ themeId, onThemeChange }: Props) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Thème">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          title={`${t.name} — ${t.tagline}`}
          aria-label={t.name}
          aria-pressed={themeId === t.id}
          onClick={() => onThemeChange(t.id)}
          className={`h-4 w-4 rounded-full border transition ${
            themeId === t.id
              ? "scale-110 border-white/80"
              : "border-white/15 hover:border-white/40"
          }`}
          style={{
            background: `linear-gradient(135deg, ${t.canvas.excited}, ${t.canvas.event})`,
          }}
        />
      ))}
    </div>
  );
}
