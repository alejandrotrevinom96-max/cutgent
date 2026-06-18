/**
 * Themes de Claudit — las 4 direcciones del rediseño de Claude Design:
 *   Refined Dark · Liquid Glass · Light & Airy · High-Contrast Pro
 *
 * Los VALORES de cada theme viven en globals.css bajo `[data-theme="<id>"]`
 * (variables CSS). Cambiar de theme = cambiar `document.documentElement.dataset.theme`
 * → aplica al instante y sin flash (un script en el <head> lo fija antes del
 * primer paint leyendo localStorage). Aquí solo está el catálogo para la UI.
 */

export interface Theme {
  id: string;
  name: string;
  scheme: "dark" | "light";
  /** Muestra de paleta para el switcher: [bg, panel, accent, accent-2]. */
  swatch: [string, string, string, string];
}

export const THEMES: Theme[] = [
  {
    id: "refined-dark",
    name: "Refined Dark",
    scheme: "dark",
    swatch: ["#0c0d13", "#161823", "#818cf8", "#a78bfa"],
  },
  {
    id: "liquid-glass",
    name: "Liquid Glass",
    scheme: "dark",
    swatch: ["#140f2b", "#2a2350", "#7c8cff", "#a855f7"],
  },
  {
    id: "light-airy",
    name: "Light & Airy",
    scheme: "light",
    swatch: ["#f4f2ee", "#ffffff", "#6366f1", "#8b5cf6"],
  },
  {
    id: "contrast-pro",
    name: "High-Contrast Pro",
    scheme: "dark",
    swatch: ["#0a0a0b", "#141417", "#f97316", "#fbbf24"],
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME_ID = "refined-dark";
const STORAGE_KEY = "claudit-theme";

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Aplica un theme (cambia el atributo data-theme en :root). Solo cliente. */
export function applyTheme(id: string): void {
  if (typeof document === "undefined") return;
  const theme = getTheme(id);
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.style.colorScheme = theme.scheme;
}

export function loadThemeId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && THEME_IDS.includes(saved)) return saved;
  } catch {
    /* localStorage bloqueado */
  }
  return DEFAULT_THEME_ID;
}

export function saveThemeId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
