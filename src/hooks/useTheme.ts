"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THEME_ID, getTheme } from "@/lib/themes";

const KEY = "myeline-theme";

/** État du thème actif, persisté en localStorage. */
export function useTheme() {
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setThemeId(saved);
    } catch {
      // localStorage indisponible : on reste sur le thème par défaut.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, themeId);
    } catch {
      // ignore
    }
  }, [themeId]);

  return { themeId, setThemeId, theme: getTheme(themeId) };
}
