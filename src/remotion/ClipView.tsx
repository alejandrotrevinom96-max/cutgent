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

  // A solid fills the whole canvas, so it bypasses the centered wrapper
  // (which has no intrinsic size) and applies only opacity/filter/grade.
  if (clip.type === "solid") {
    const g = clip.colorGrade ? colorGradeFilter(clip.id, clip.colorGrade) : null;
    const filter = g
      ? `${d.filter && d.filter !== "none" ? `${d.filter} ` : ""}url(#${g.id})`
      : d.filter;
    return (
      <AbsoluteFill style={{ backgroundColor: clip.color, opacity: d.opacity, filter }}>
        {g?.svg}
      </AbsoluteFill>
    );
  }

  const blend = clip.blendMode && clip.blendMode !== "normal" ? clip.blendMode : undefined;

  // Corrección de color pro: filtro SVG combinado con los filtros CSS (efectos).
  const grade = clip.colorGrade ? colorGradeFilter(clip.id, clip.colorGrade) : null;
  let filterStr = d.filter;
  if (grade) {
    filterStr = filterStr && filterStr !== "none" ? `${filterStr} url(#${grade.id})` : `url(#${grade.id})`;
  }

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
  let inner: React.ReactNode = renderContent(clip, d, trackVolume, { width, height }, {
    preview,
    proxyMap,
    sampleScope,
  });

  if (clip.crop) {
    const { top, right, bottom, left } = clip.crop;
    inner = (
      <div style={{ clipPath: `inset(${top}% ${right}% ${bottom}% ${left}%)` }}>{inner}</div>
    );
  }

  if (clip.mask && clip.mask !== "none") {
    const maskStyle: React.CSSProperties = {};
    if (clip.mask === "circle") maskStyle.clipPath = "circle(50%)";
    else if (clip.mask === "ellipse") maskStyle.clipPath = "ellipse(50% 50%)";
    else if (clip.mask === "rounded") {
      maskStyle.borderRadius = "24px";
      maskStyle.overflow = "hidden";
    }
    inner = <div style={maskStyle}>{inner}</div>;
  }

  return (
    <div style={wrapperStyle}>
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

function renderContent(
  clip: Clip,
  d: ReturnType<typeof getClipDynamics>,
  trackVolume: number,
  canvas: { width: number; height: number },
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
          {clip.text}
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
