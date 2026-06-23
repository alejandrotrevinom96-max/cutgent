import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Circle, Ellipse, Rect, Star, Triangle } from "@remotion/shapes";
import type { Clip } from "@/lib/schema";
import { audioGain, clipVolumeAt, getClipDynamics } from "./animation";
import { sampleElement } from "@/lib/scopes";

/**
 * Renders a single clip. Placed inside a <Sequence>, so useCurrentFrame()
 * returns the frame relative to the clip's own start. All visual clips share
 * the same animated wrapper; type-specific content fills it.
 */
export const ClipView: React.FC<{
  clip: Clip;
  trackVolume: number;
  preview?: boolean;
  proxyMap?: Record<string, string>;
  /** Si true, samplea este clip para los scopes (solo el seleccionado). */
  sampleScope?: boolean;
}> = ({ clip, trackVolume, preview, proxyMap, sampleScope }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const d = getClipDynamics(clip, frame, fps, { width, height });

  // Audio has no visual; render the <Audio> tag directly.
  if (clip.type === "audio") {
    return (
      <Audio
        src={clip.src}
        startFrom={clip.trimStart}
        playbackRate={clip.playbackRate}
        volume={(f) =>
          clipVolumeAt(clip, f) *
          trackVolume *
          audioGain(f, clip.duration, clip.fadeInFrames, clip.fadeOutFrames)
        }
      />
    );
  }

  // Efectos avanzados (filtros SVG glow/rgb/duo + overlay de viñeta), compartidos
  // por todos los clips visuales.
  const fx = advancedEffects(clip);

  // A solid fills the whole canvas, so it bypasses the centered wrapper
  // (which has no intrinsic size) and applies only opacity/filter/grade.
  if (clip.type === "solid") {
    const g = clip.colorGrade ? colorGradeFilter(clip.id, clip.colorGrade) : null;
    let filter = d.filter && d.filter !== "none" ? d.filter : "";
    for (const f of [...fx.filters, g]) if (f) filter = filter ? `${filter} url(#${f.id})` : `url(#${f.id})`;
    if (!filter) filter = "none";
    return (
      <AbsoluteFill style={{ backgroundColor: clip.color, opacity: d.opacity, filter }}>
        {fx.svgs}
        {g?.svg}
        {fx.vignette}
      </AbsoluteFill>
    );
  }

  const blend = clip.blendMode && clip.blendMode !== "normal" ? clip.blendMode : undefined;

  // Filtros SVG combinados con los CSS. Orden: efectos CSS → glow/rgb/duo → grade.
  const grade = clip.colorGrade ? colorGradeFilter(clip.id, clip.colorGrade) : null;
  let filterStr = d.filter && d.filter !== "none" ? d.filter : "";
  for (const f of [...fx.filters, grade]) if (f) filterStr = filterStr ? `${filterStr} url(#${f.id})` : `url(#${f.id})`;
  if (!filterStr) filterStr = "none";

  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: `translate(-50%, -50%) translate(${d.x}px, ${d.y}px) scale(${d.scale}) rotate(${d.rotation}deg)`,
    opacity: d.opacity,
    filter: filterStr,
    clipPath: d.clipPath,
    mixBlendMode: blend as React.CSSProperties["mixBlendMode"],
    transformOrigin: "center center",
  };

  // crop y mask se aplican en divs anidados para que no compitan por clip-path.
  let inner: React.ReactNode = renderContent(clip, d, trackVolume, { width, height }, frame, {
    preview,
    proxyMap,
    sampleScope,
  });

  // Viñeta: overlay dentro del contenido (así la recortan crop/mask, como debe ser).
  if (fx.vignette) {
    inner = (
      <div style={{ position: "relative", display: "inline-block" }}>
        {inner}
        {fx.vignette}
      </div>
    );
  }

  if (clip.crop) {
    const { top, right, bottom, left } = clip.crop;
    inner = (
      <div style={{ clipPath: `inset(${top}% ${right}% ${bottom}% ${left}%)` }}>{inner}</div>
    );
  }

  if (clip.mask && clip.mask !== "none") {
    // maskRadius (0..100) anima la forma por frame: 0 = cerrada, 100 = completa.
    // Con 100 equivale al comportamiento previo (circle(50%) / ellipse(50% 50%) / 24px).
    const r = d.maskRadius / 2; // % del semieje (100 → 50% = forma inscrita completa)
    const maskStyle: React.CSSProperties = {};
    if (clip.mask === "circle") maskStyle.clipPath = `circle(${r}%)`;
    else if (clip.mask === "ellipse") maskStyle.clipPath = `ellipse(${r}% ${r}%)`;
    else if (clip.mask === "rounded") {
      maskStyle.borderRadius = `${24 * (d.maskRadius / 100)}px`;
      maskStyle.overflow = "hidden";
    }
    inner = <div style={maskStyle}>{inner}</div>;
  }

  return (
    <div style={wrapperStyle}>
      {fx.svgs}
      {grade?.svg}
      {inner}
    </div>
  );
}

/**
 * Construye un filtro SVG de corrección de color (estilo lift/gamma/gain +
 * temperatura/tinte/saturación/contraste). Devuelve null si todo es neutro.
 */
function colorGradeFilter(
  clipId: string,
  cg: NonNullable<Clip["colorGrade"]>,
): { id: string; svg: React.ReactNode } | null {
  const { temperature: T, tint: N, exposure: E, contrast: C, saturation: S, lift: L, gamma: G, gain: GA } = cg;
  const z = { r: 0, g: 0, b: 0 };
  const wl = cg.liftRGB ?? z; // rueda sombras
  const wg = cg.gammaRGB ?? z; // rueda medios
  const wga = cg.gainRGB ?? z; // rueda altas
  const hasWheel = (w: { r: number; g: number; b: number }) => !!(w.r || w.g || w.b);
  if (!T && !N && !E && !C && !S && !L && !G && !GA && !hasWheel(wl) && !hasWheel(wg) && !hasWheel(wga))
    return null;

  const expMul = 1 + 0.5 * (E / 100);
  const rMul = (1 + 0.3 * (T / 100)) * expMul;
  const gMul = (1 - 0.25 * (N / 100)) * expMul;
  const bMul = (1 - 0.3 * (T / 100)) * expMul;
  const sat = Math.max(0, 1 + S / 100);
  const c = Math.max(0, 1 + C / 100);
  const intercept = (1 - c) / 2;
  const amp = Math.max(0.1, 1 + 0.5 * (GA / 100));
  const exp = Math.min(4, Math.max(0.1, 1 - 0.5 * (G / 100)));
  const liftOff = 0.12 * (L / 100);

  // Las ruedas inclinan, per-canal, la amplitud (gain/altas), el exponente
  // (gamma/medios) y el offset (lift/sombras) sobre los valores maestros.
  const ampCh = (w: number) => Math.max(0.1, amp * (1 + 0.5 * (w / 100)));
  const expCh = (w: number) => Math.min(4, Math.max(0.1, exp * (1 - 0.5 * (w / 100))));
  const offCh = (w: number) => liftOff + 0.12 * (w / 100);

  const matrix = `${rMul} 0 0 0 0  0 ${gMul} 0 0 0  0 0 ${bMul} 0 0  0 0 0 1 0`;
  const id = `cg-${clipId}`;

  return {
    id,
    svg: (
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          <filter id={id} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={matrix} />
            <feColorMatrix type="saturate" values={String(sat)} />
            <feComponentTransfer>
              <feFuncR type="linear" slope={String(c)} intercept={String(intercept)} />
              <feFuncG type="linear" slope={String(c)} intercept={String(intercept)} />
              <feFuncB type="linear" slope={String(c)} intercept={String(intercept)} />
            </feComponentTransfer>
            <feComponentTransfer>
              <feFuncR type="gamma" amplitude={String(ampCh(wga.r))} exponent={String(expCh(wg.r))} offset={String(offCh(wl.r))} />
              <feFuncG type="gamma" amplitude={String(ampCh(wga.g))} exponent={String(expCh(wg.g))} offset={String(offCh(wl.g))} />
              <feFuncB type="gamma" amplitude={String(ampCh(wga.b))} exponent={String(expCh(wg.b))} offset={String(offCh(wl.b))} />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
    ),
  };
};

// ---------------------------------------------------------------------------
// Efectos avanzados "AE-lite": glow, RGB-split y duotono se renderizan como
// <filter> SVG por-clip (mismo patrón que colorGradeFilter); la viñeta es una
// capa overlay con radial-gradient. Se componen en el filter del wrapper.
// ---------------------------------------------------------------------------

type SvgFilter = { id: string; svg: React.ReactNode };

/** Recoge los efectos avanzados presentes en el clip: filtros SVG (glow/rgb/duo)
 *  + los nodos <svg> de defs + la viñeta (overlay). */
function advancedEffects(clip: Clip): {
  filters: SvgFilter[];
  svgs: React.ReactNode;
  vignette: React.ReactNode | null;
} {
  const filters: SvgFilter[] = [];
  const glow = clip.effects.find((e) => e.type === "glow");
  if (glow && glow.value > 0) filters.push(glowFilter(clip.id, glow.value, glow.params?.threshold ?? 0.7));
  const rgb = clip.effects.find((e) => e.type === "rgb-split");
  if (rgb && rgb.value > 0) filters.push(rgbSplitFilter(clip.id, rgb.value, rgb.params?.angle ?? 0));
  const duo = clip.effects.find((e) => e.type === "duotone");
  if (duo && duo.value > 0)
    filters.push(
      duotoneFilter(clip.id, duo.value, duo.params?.shadowColor ?? "#1a1a4e", duo.params?.highlightColor ?? "#ff7ac6"),
    );
  const vig = clip.effects.find((e) => e.type === "vignette");
  const vignette = vig && vig.value > 0 ? vignetteOverlay(vig.value, vig.params?.feather ?? 50) : null;
  return {
    filters,
    svgs: filters.length
      ? filters.map((f) => <React.Fragment key={f.id}>{f.svg}</React.Fragment>)
      : null,
    vignette,
  };
}

/** Glow / bloom: aísla luces (umbral) → desenfoca → recompone sobre el original. */
function glowFilter(clipId: string, value: number, threshold: number): SvgFilter {
  const id = `glow-${clipId}`;
  const K = 1 / Math.max(0.001, 1 - threshold);
  const intercept = -threshold * K;
  const std = value * 0.4; // 0..100 → stdDeviation 0..40px
  return {
    id,
    svg: (
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          <filter id={id} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
            <feComponentTransfer in="SourceGraphic" result="bright">
              <feFuncR type="linear" slope={String(K)} intercept={String(intercept)} />
              <feFuncG type="linear" slope={String(K)} intercept={String(intercept)} />
              <feFuncB type="linear" slope={String(K)} intercept={String(intercept)} />
            </feComponentTransfer>
            <feGaussianBlur in="bright" stdDeviation={String(std)} result="blur" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    ),
  };
}

/** RGB-split / aberración cromática: separa canales y desplaza R y B opuestos. */
function rgbSplitFilter(clipId: string, value: number, angle: number): SvgFilter {
  const id = `rgb-${clipId}`;
  const rad = (angle * Math.PI) / 180;
  const dx = value * Math.cos(rad);
  const dy = value * Math.sin(rad);
  return {
    id,
    svg: (
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          <filter id={id} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="R" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="G" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="B" />
            <feOffset in="R" dx={String(dx)} dy={String(dy)} result="Ro" />
            <feOffset in="B" dx={String(-dx)} dy={String(-dy)} result="Bo" />
            <feBlend in="Ro" in2="G" mode="screen" result="RG" />
            <feBlend in="RG" in2="Bo" mode="screen" />
          </filter>
        </defs>
      </svg>
    ),
  };
}

/** Duotono: luminancia → mapa a 2 colores (sombras/altas), mezclado con value. */
function duotoneFilter(clipId: string, value: number, shadowColor: string, highlightColor: string): SvgFilter {
  const id = `duo-${clipId}`;
  const [sR, sG, sB] = hexToRgb01(shadowColor);
  const [hR, hG, hB] = hexToRgb01(highlightColor);
  const mix = value / 100;
  return {
    id,
    svg: (
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          <filter id={id} colorInterpolationFilters="sRGB">
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0"
              result="gray"
            />
            <feComponentTransfer in="gray" result="duo">
              <feFuncR type="table" tableValues={`${sR} ${hR}`} />
              <feFuncG type="table" tableValues={`${sG} ${hG}`} />
              <feFuncB type="table" tableValues={`${sB} ${hB}`} />
              <feFuncA type="table" tableValues="1 1" />
            </feComponentTransfer>
            <feComponentTransfer in="duo" result="duoA">
              <feFuncA type="linear" slope={String(mix)} />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="duoA" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    ),
  };
}

/** Viñeta: capa radial oscura en los bordes (no filtro). */
function vignetteOverlay(value: number, feather: number): React.ReactNode {
  const alpha = (value / 100) * 0.85;
  const inner = 30 + (feather / 100) * 40; // 30..70% transparente al centro
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        borderRadius: "inherit",
        background: `radial-gradient(ellipse at center, transparent ${inner}%, rgba(0,0,0,${alpha}) 100%)`,
      }}
    />
  );
}

/** "#rrggbb" / "#rgb" → [r,g,b] en 0..1 (fallback negro si es inválido). */
function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function renderContent(
  clip: Clip,
  d: ReturnType<typeof getClipDynamics>,
  trackVolume: number,
  canvas: { width: number; height: number },
  frame: number,
  opts: { preview?: boolean; proxyMap?: Record<string, string>; sampleScope?: boolean } = {},
): React.ReactNode {
  switch (clip.type) {
    case "video": {
      const w = clip.width ?? canvas.width;
      const h = clip.height ?? canvas.height;
      // En preview usa el proxy si existe; el render siempre el original.
      const src =
        opts.preview && opts.proxyMap?.[clip.src] ? opts.proxyMap[clip.src] : clip.src;
      return (
        <OffthreadVideo
          src={src}
          startFrom={clip.trimStart}
          playbackRate={clip.playbackRate}
          muted={clip.muted}
          volume={
            clip.muted
              ? 0
              : (f) =>
                  clipVolumeAt(clip, f) *
                  trackVolume *
                  audioGain(f, clip.duration, clip.fadeInFrames ?? 0, clip.fadeOutFrames ?? 0)
          }
          // .webm = posible canal alfa (p.ej. chroma key). transparent fuerza
          // extracción PNG en el render para conservar la transparencia.
          // Evaluado sobre el src ORIGINAL (el proxy es .mp4 sin alfa).
          transparent={clip.src.endsWith(".webm")}
          onVideoFrame={opts.sampleScope ? (el) => sampleElement(el) : undefined}
          style={{ width: w, height: h, objectFit: clip.fit }}
        />
      );
    }
    case "image": {
      const w = clip.width ?? canvas.width;
      const h = clip.height ?? canvas.height;
      return (
        <Img
          src={clip.src}
          onImageFrame={opts.sampleScope ? (el) => sampleElement(el) : undefined}
          style={{ width: w, height: h, objectFit: clip.fit }}
        />
      );
    }
    case "text": {
      const textShadow =
        clip.shadowColor && clip.shadowBlur >= 0
          ? `${clip.shadowOffsetX}px ${clip.shadowOffsetY}px ${clip.shadowBlur}px ${clip.shadowColor}`
          : undefined;
      const stroke =
        clip.strokeColor && clip.strokeWidth > 0
          ? { WebkitTextStrokeWidth: clip.strokeWidth, WebkitTextStrokeColor: clip.strokeColor }
          : {};
      // Captions karaoke: si hay `words`, resalta la palabra activa según el frame
      // (relativo al clip por estar dentro de un <Sequence>).
      const content =
        clip.words && clip.words.length > 0
          ? clip.words.map((w, i) => {
              const active = frame >= w.start && frame < w.end;
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    margin: "0 0.18em",
                    color: active ? clip.activeColor ?? "#ffe000" : clip.color,
                    transform: active ? `scale(${clip.activeScale ?? 1.12})` : undefined,
                    transformOrigin: "center",
                  }}
                >
                  {w.text}
                </span>
              );
            })
          : clip.text;
      return (
        <div
          style={{
            width: clip.width,
            fontFamily: clip.fontFamily,
            fontSize: clip.fontSize,
            fontWeight: clip.fontWeight,
            fontStyle: clip.italic ? "italic" : "normal",
            color: clip.color,
            background: clip.backgroundColor,
            textAlign: clip.textAlign,
            lineHeight: clip.lineHeight,
            letterSpacing: clip.letterSpacing,
            padding: clip.backgroundColor ? "0.2em 0.4em" : 0,
            textShadow,
            whiteSpace: "pre-wrap",
            ...stroke,
          }}
        >
          {content}
        </div>
      );
    }
    case "shape":
      return renderShape(clip);
    case "solid":
      return (
        <AbsoluteFill style={{ background: clip.color, width: canvas.width, height: canvas.height }} />
      );
    default:
      return null;
  }
}

function renderShape(clip: Extract<Clip, { type: "shape" }>): React.ReactNode {
  const size = clip.width ?? 300;
  const common = {
    fill: clip.fill,
    stroke: clip.strokeColor,
    strokeWidth: clip.strokeWidth,
  };
  switch (clip.shape) {
    case "rect":
      return (
        <Rect
          width={clip.width ?? 400}
          height={clip.height ?? 250}
          cornerRadius={clip.cornerRadius}
          {...common}
        />
      );
    case "circle":
      return <Circle radius={size / 2} {...common} />;
    case "ellipse":
      return <Ellipse rx={(clip.width ?? 400) / 2} ry={(clip.height ?? 250) / 2} {...common} />;
    case "triangle":
      return <Triangle length={size} direction="up" {...common} />;
    case "star":
      return <Star innerRadius={size / 4} outerRadius={size / 2} points={5} {...common} />;
    default:
      return null;
  }
}
