/**
 * Ramer–Douglas–Peucker: simplifica una polilínea (frame, value) conservando su
 * forma. Se usa para reducir curvas de keyframes densas (p.ej. tracking por IA: un
 * punto por frame → decenas de keyframes) y no reventar JSON/undo/SSE en clips
 * largos. Función PURA, sin I/O, importable desde el cliente y el MCP server.
 */

export interface Pt {
  frame: number;
  value: number;
}

/** Distancia perpendicular del punto p al segmento a→b en el plano (frame, value). */
function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.frame - a.frame;
  const dy = b.value - a.value;
  if (dx === 0 && dy === 0) return Math.hypot(p.frame - a.frame, p.value - a.value);
  const num = Math.abs(dy * (p.frame - a.frame) - dx * (p.value - a.value));
  return num / Math.hypot(dx, dy);
}

/**
 * Simplifica `points` con tolerancia `epsilon` en UNIDADES DE value (px para x/y;
 * multiplicador para scale; 0..1 para opacity). Conserva SIEMPRE el primer y
 * último punto. Asume `points` ordenados por frame.
 */
export function rdp(points: Pt[], epsilon: number): Pt[] {
  if (points.length <= 2) return points.slice();
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      idx = i;
    }
  }
  if (maxDist <= epsilon) return [first, last];
  const left = rdp(points.slice(0, idx + 1), epsilon);
  const right = rdp(points.slice(idx), epsilon);
  return left.slice(0, -1).concat(right); // evita duplicar el punto pivote
}
