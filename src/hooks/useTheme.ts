"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_THEME_ID, getTheme } from "@/lib/themes";

const KEY = "myeline-theme";

// Le thème actif vit dans localStorage : c'est un store EXTERNE à React, donc
// useSyncExternalStore — pas useState + useEffect (hydratation : le serveur et le
// premier rendu client rendent tous deux le thème par défaut, puis le snapshot
// client relit la valeur persistée).
const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  // Propagation entre onglets : l'événement storage ne se déclenche que dans les
  // AUTRES fenêtres — d'où `listeners` pour la fenêtre courante.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? DEFAULT_THEME_ID;
  } catch {
    // localStorage indisponible : on reste sur le thème par défaut.
    return DEFAULT_THEME_ID;
  }
}

const getServerSnapshot = () => DEFAULT_THEME_ID;

/** État du thème actif, persisté en localStorage. */
export function useTheme() {
  const themeId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setThemeId = useCallback((id: string) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // ignore
    }
    for (const l of listeners) l();
  }, []);

  return { themeId, setThemeId, theme: getTheme(themeId) };
}
