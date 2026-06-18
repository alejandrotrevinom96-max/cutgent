"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/store";
import { findClip } from "@/lib/commands";
import { clearScope, getScope, subscribeScope } from "@/lib/scopes";

/**
 * Scopes de video (histograma RGB / waveform de luma / vectorscopio). Lee el
 * ImageData del clip seleccionado publicado por ClipView. Mide la FUENTE del
 * clip (antes del grade/CSS/blend), no el composite final → etiqueta "Fuente".
 */

type ScopeKind = "histograma" | "waveform" | "vector";
const CW = 256;
const CH = 150;

function drawHistogram(ctx: CanvasRenderingContext2D, img: ImageData) {
  const bins = { r: new Float32Array(256), g: new Float32Array(256), b: new Float32Array(256) };
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    bins.r[d[i]]++;
    bins.g[d[i + 1]]++;
    bins.b[d[i + 2]]++;
  }
  let max = 1;
  for (let i = 0; i < 256; i++) max = Math.max(max, bins.r[i], bins.g[i], bins.b[i]);
  ctx.globalCompositeOperation = "lighter";
  const chans: [Float32Array, string][] = [
    [bins.r, "rgba(255,80,80,0.8)"],
    [bins.g, "rgba(80,255,120,0.8)"],
    [bins.b, "rgba(90,140,255,0.8)"],
  ];
  for (const [bin, color] of chans) {
    ctx.beginPath();
    ctx.moveTo(0, CH);
    for (let x = 0; x < 256; x++) {
      const v = (bin[x] / max) * CH;
      ctx.lineTo((x / 255) * CW, CH - v);
    }
    ctx.lineTo(CW, CH);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawWaveform(ctx: CanvasRenderingContext2D, img: ImageData) {
  const d = img.data;
  const w = img.width, h = img.height;
  ctx.fillStyle = "rgba(140,255,170,0.10)";
  // Por cada pixel: x mapea a columna, y = luma. Punto translúcido (acumula).
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const luma = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const px = (x / (w - 1)) * CW;
      const py = CH - (luma / 255) * CH;
      ctx.fillRect(px, py, 1, 1);
    }
  }
}

function drawVectorscope(ctx: CanvasRenderingContext2D, img: ImageData) {
  const d = img.data;
  const cx = CW / 2, cy = CH / 2;
  const rad = Math.min(CW, CH) / 2 - 4;
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(180,220,255,0.18)";
  for (let i = 0; i < d.length; i += 8) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // Rec.601 Cb/Cr en −0.5..0.5
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
    const px = cx + (cb / 128) * rad;
    const py = cy - (cr / 128) * rad;
    ctx.fillRect(px, py, 1, 1);
  }
}

export function ScopesPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [kind, setKind] = useState<ScopeKind>("histograma");
  const kindRef = useRef(kind);
  kindRef.current = kind;

  const selType = useEditor((s) => {
    const id = s.selectedClipId;
    if (!id) return null;
    return findClip(s.document, id)?.clip.type ?? null;
  });
  const isSamplable = selType === "video" || selType === "image";

  // Si el clip seleccionado no produce muestra (texto/forma/audio/nada), limpia
  // el canal para no mostrar el frame del clip anterior.
  useEffect(() => {
    if (!isSamplable) clearScope();
  }, [isSamplable]);

  useEffect(() => {
    let raf = 0;
    let dirty = true;
    const onUpdate = () => {
      dirty = true;
    };
    const unsub = subscribeScope(onUpdate);

    const loop = () => {
      if (dirty) {
        dirty = false;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#0a0a0a";
          ctx.fillRect(0, 0, CW, CH);
          const { data } = getScope();
          if (data) {
            if (kindRef.current === "histograma") drawHistogram(ctx, data);
            else if (kindRef.current === "waveform") drawWaveform(ctx, data);
            else drawVectorscope(ctx, data);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      unsub();
      cancelAnimationFrame(raf);
    };
  }, []);

  // Forzar un redraw al cambiar de tipo de scope.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, CW, CH);
    const { data } = getScope();
    if (data) {
      if (kind === "histograma") drawHistogram(ctx, data);
      else if (kind === "waveform") drawWaveform(ctx, data);
      else drawVectorscope(ctx, data);
    }
  }, [kind]);

  return (
    <div className="w-[268px] rounded-lg border border-border bg-panel/95 p-2 shadow-2xl backdrop-blur">
      <div className="mb-1.5 flex items-center gap-1 text-[10px]">
        {(["histograma", "waveform", "vector"] as ScopeKind[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setKind(s)}
            className={`rounded px-1.5 py-0.5 capitalize ${
              kind === s ? "bg-panel-2 text-text" : "text-muted hover:text-text"
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-[9px] text-muted">Fuente (clip)</span>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          className="w-full rounded border border-border bg-black"
        />
        {!isSamplable && (
          <div className="absolute inset-0 flex items-center justify-center rounded bg-black/70 px-3 text-center text-[10px] text-muted">
            Selecciona un clip de video o imagen para ver sus scopes
          </div>
        )}
      </div>
    </div>
  );
}
