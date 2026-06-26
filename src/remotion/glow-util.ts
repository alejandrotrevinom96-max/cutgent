/**
 * Helpers PUROS de color para los efectos SVG (sin React/Remotion → testeables
 * con tsx, deterministas). Viven aquí para que glowFilter/duotoneFilter no dupliquen
 * el parseo de hex y para poder verificar el tinte sin levantar un render.
 */

/** "#rrggbb" / "#rgb" → [r,g,b] en 0..1 (fallback negro si es inválido). */
export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Matriz `values` de un <feColorMatrix> diagonal que TINTA el bloom multiplicando
 * cada canal por el RGB del color (preserva la forma/luminancia del bloom, a
 * diferencia de un feFlood plano). Devuelve null si no hay que tintar:
 *  - color undefined, o
 *  - hex inválido / negro (suma 0) → así el glow cae EXACTO al bloom neutro actual.
 */
export function glowTintValues(color?: string): string | null {
  if (!color) return null;
  const [r, g, b] = hexToRgb01(color);
  if (r + g + b <= 0) return null;
  return `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`;
}
