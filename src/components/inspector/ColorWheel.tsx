"use client";

import { useCallback, useRef } from "react";
import type { RgbTriad } from "@/lib/schema";

/**
 * Rueda de color estilo DaVinci: arrastra el punto para inclinar el balance de
 * color de una zona (sombras/medios/altas). El ángulo = matiz, el radio =
 * intensidad. El centro = neutro. Devuelve un triad RGB en −100..100.
 */

const SIZE = 96;
const R = SIZE / 2;

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

/** triad (−100..100) → posición normalizada del punto en el disco (−1..1). */
function triadToPos(t: RgbTriad): { nx: number; ny: number } {
  const r = 0.5 + t.r / 200, g = 0.5 + t.g / 200, b = 0.5 + t.b / 200;
  const [h, s] = rgbToHsv(r, g, b);
  const rad = (h * Math.PI) / 180;
  return { nx: Math.cos(rad) * s, ny: Math.sin(rad) * s };
}

/** posición normalizada → triad (−100..100). */
function posToTriad(nx: number, ny: number): RgbTriad {
  const radius = Math.min(1, Math.hypot(nx, ny));
  if (radius < 0.02) return { r: 0, g: 0, b: 0 };
  let hue = (Math.atan2(ny, nx) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  const [r, g, b] = hsvToRgb(hue, 1, 1);
  return {
    r: Math.round((r - 0.5) * 2 * radius * 100),
    g: Math.round((g - 0.5) * 2 * radius * 100),
    b: Math.round((b - 0.5) * 2 * radius * 100),
  };
}

export function ColorWheel({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: RgbTriad;
  onChange: (t: RgbTriad) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const triad = value ?? { r: 0, g: 0, b: 0 };
  const { nx, ny } = triadToPos(triad);

  const handleAt = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (clientX - cx) / R;
      const dy = (clientY - cy) / R;
      onChange(posToTriad(dx, dy));
    },
    [onChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      handleAt(e.clientX, e.clientY);
      const move = (ev: PointerEvent) => handleAt(ev.clientX, ev.clientY);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [handleAt],
  );

  const handleX = R + nx * (R - 6);
  const handleY = R + ny * (R - 6);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onDoubleClick={() => onChange({ r: 0, g: 0, b: 0 })}
        title={`${label} — arrastra para teñir · doble clic: reset`}
        className="relative cursor-crosshair rounded-full border border-border"
        style={{
          width: SIZE,
          height: SIZE,
          background:
            "radial-gradient(circle, rgba(128,128,128,1) 0%, rgba(128,128,128,0) 70%), " +
            "conic-gradient(from 90deg, red, magenta, blue, cyan, lime, yellow, red)",
        }}
      >
        <div
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: handleX, top: handleY, background: "rgba(0,0,0,0.2)" }}
        />
      </div>
      <span className="text-[10px] text-muted">{label}</span>
    </div>
  );
}
