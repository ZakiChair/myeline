// Quatre thèmes = quatre façons réelles de « voir » un cerveau.
// Chaque thème pilote à la fois le chrome (variables CSS) et le canvas (couleurs JS),
// source de vérité unique ici.

export interface ThemeCanvas {
  excited: string;
  excitedCore: string;
  refractory: string;
  rest: string;
  event: string;
  linkActive: string;
  linkIdle: string;
  glowExcitedAlpha: number;
  glowExcitedMul: number;
  glowRestAlpha: number;
  /** Couleur de fond opaque (scène 3D WebGL). */
  bg: string;
}

export interface Theme {
  id: string;
  name: string;
  tagline: string;
  /** Variables CSS posées sur le conteneur racine (chrome). */
  vars: Record<string, string>;
  canvas: ThemeCanvas;
  /** Couleurs du tracé d'activité (recharts). */
  chart: { total: string; excited: string };
}

export const THEMES: Theme[] = [
  {
    id: "myeline",
    name: "Myéline",
    tagline: "vue électrode — décharges vives",
    vars: {
      "--app-bg":
        "radial-gradient(900px 620px at 16% -8%, rgba(103,246,255,0.08), transparent 60%), radial-gradient(820px 620px at 102% 112%, rgba(167,139,250,0.08), transparent 60%), #050507",
      "--stage-bg":
        "radial-gradient(62% 62% at 50% 42%, rgba(103,246,255,0.05), transparent 70%), radial-gradient(52% 52% at 82% 86%, rgba(167,139,250,0.05), transparent 70%)",
      "--primary": "#67f6ff",
      "--primary-foreground": "#06121a",
      "--ring": "#67f6ff",
      "--a1": "#67f6ff",
      "--a2": "#a78bfa",
      "--a3": "#ff7ae0",
    },
    canvas: {
      excited: "#67f6ff",
      excitedCore: "#e6fdff",
      refractory: "#8b7bc9",
      rest: "#4a5a7a",
      event: "#ff7ae0",
      linkActive: "#96fbff",
      linkIdle: "#67beff",
      glowExcitedAlpha: 0.55,
      glowExcitedMul: 4.4,
      glowRestAlpha: 0.12,
      bg: "#050507",
    },
    chart: { total: "#a78bfa", excited: "#67f6ff" },
  },
  {
    id: "immuno",
    name: "Immuno",
    tagline: "imagerie de fluorescence — cellules & connectome",
    vars: {
      "--app-bg":
        "radial-gradient(800px 600px at 20% -6%, rgba(118,255,178,0.07), transparent 60%), radial-gradient(760px 600px at 100% 110%, rgba(255,92,200,0.08), transparent 60%), #03070a",
      "--stage-bg":
        "radial-gradient(60% 60% at 50% 44%, rgba(118,255,178,0.05), transparent 70%), radial-gradient(55% 55% at 80% 84%, rgba(255,92,200,0.05), transparent 70%)",
      "--primary": "#76ffb2",
      "--primary-foreground": "#04140c",
      "--ring": "#76ffb2",
      "--a1": "#76ffb2",
      "--a2": "#ff5cc8",
      "--a3": "#ffe08a",
    },
    canvas: {
      excited: "#76ffb2",
      excitedCore: "#e9fff2",
      refractory: "#c86bb0",
      rest: "#2f5a48",
      event: "#ff5cc8",
      linkActive: "#ff8fd8",
      linkIdle: "#d24fa8",
      glowExcitedAlpha: 0.5,
      glowExcitedMul: 4.1,
      glowRestAlpha: 0.14,
      bg: "#03070a",
    },
    chart: { total: "#ff5cc8", excited: "#76ffb2" },
  },
  {
    id: "oscilloscope",
    name: "Oscilloscope",
    tagline: "phosphore ambre — l'instrument",
    vars: {
      "--app-bg":
        "radial-gradient(900px 600px at 50% -10%, rgba(255,162,61,0.06), transparent 62%), #0a0703",
      "--stage-bg":
        "radial-gradient(60% 60% at 50% 45%, rgba(255,162,61,0.05), transparent 72%)",
      "--primary": "#ffc24d",
      "--primary-foreground": "#1a1000",
      "--ring": "#ffc24d",
      "--a1": "#ffc24d",
      "--a2": "#ff8a3d",
      "--a3": "#ffe08a",
    },
    canvas: {
      excited: "#ffc24d",
      excitedCore: "#fff0c8",
      refractory: "#b5763a",
      rest: "#3a2e1c",
      event: "#ffd98a",
      linkActive: "#ffcf6b",
      linkIdle: "#8a6a2e",
      glowExcitedAlpha: 0.5,
      glowExcitedMul: 3.7,
      glowRestAlpha: 0.12,
      bg: "#0a0703",
    },
    chart: { total: "#ff8a3d", excited: "#ffc24d" },
  },
  {
    id: "ultraviolet",
    name: "Ultraviolet",
    tagline: "lumière noire — néon synaptique",
    vars: {
      "--app-bg":
        "radial-gradient(880px 620px at 14% -8%, rgba(255,61,240,0.08), transparent 60%), radial-gradient(820px 640px at 104% 112%, rgba(67,224,255,0.06), transparent 60%), #08040f",
      "--stage-bg":
        "radial-gradient(62% 62% at 50% 42%, rgba(255,61,240,0.06), transparent 70%), radial-gradient(52% 52% at 82% 86%, rgba(157,107,255,0.06), transparent 70%)",
      "--primary": "#ff5cf2",
      "--primary-foreground": "#160320",
      "--ring": "#ff5cf2",
      "--a1": "#ff5cf2",
      "--a2": "#9d6bff",
      "--a3": "#43e0ff",
    },
    canvas: {
      excited: "#ff5cf2",
      excitedCore: "#ffd6fb",
      refractory: "#9d6bff",
      rest: "#4a3a7a",
      event: "#43e0ff",
      linkActive: "#c98bff",
      linkIdle: "#6b5cff",
      glowExcitedAlpha: 0.58,
      glowExcitedMul: 4.4,
      glowRestAlpha: 0.13,
      bg: "#08040f",
    },
    chart: { total: "#9d6bff", excited: "#ff5cf2" },
  },
];

export const DEFAULT_THEME_ID = "myeline";

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
