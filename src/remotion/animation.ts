import { Easing, interpolate, spring } from "remotion";
import type {
  Animation,
  AnimatableProperty,
  Clip,
  Easing as EasingName,
  Effect,
  KeyframeTrack,
} from "@/lib/schema";

/**
 * Pure animation math shared by the <Player> preview and the headless renderer
 * so both look identical. Given a clip and the frame *within* that clip, it
 * returns the fully-resolved visual transform.
 */

export interface ClipDynamics {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  volume: number;
  /** % de tamaño de la máscara (0..100), interpolado por keyframes de "maskRadius". */
  maskRadius: number;
  filter: string;
  clipPath?: string;
}

function easingFn(name: EasingName): (t: number) => number {
  switch (name) {
    case "linear":
      return Easing.linear;
    case "ease":
      return Easing.bezier(0.25, 0.1, 0.25, 1);
    case "ease-in":
      return Easing.bezier(0.42, 0, 1, 1);
    case "ease-out":
      return Easing.bezier(0, 0, 0.58, 1);
    case "ease-in-out":
      return Easing.bezier(0.42, 0, 0.58, 1);
    case "spring":
      return Easing.bezier(0.34, 1.56, 0.64, 1); // approximate overshoot
    default:
      return Easing.linear;
  }
}

function interpKeyframes(track: KeyframeTrack, localFrame: number): number | null {
  const kfs = track.keyframes;
  if (kfs.length === 0) return null;
  if (kfs.length === 1) return kfs[0].value;
  if (localFrame <= kfs[0].frame) return kfs[0].value;
  if (localFrame >= kfs[kfs.length - 1].frame) return kfs[kfs.length - 1].value;

  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (localFrame >= a.frame && localFrame <= b.frame) {
      return interpolate(localFrame, [a.frame, b.frame], [a.value, b.value], {
        easing: easingFn(b.easing),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
  }
  return kfs[kfs.length - 1].value;
}

interface PresetContribution {
  dx: number;
  dy: number;
  scaleMul: number;
  opacityMul: number;
  blur: number;
  clipInsetPct?: { side: "left" | "right"; pct: number };
}

const NEUTRAL: PresetContribution = { dx: 0, dy: 0, scaleMul: 1, opacityMul: 1, blur: 0 };

/**
 * @param progress 0 = fully animated-out (hidden state), 1 = fully settled.
 */
function presetContribution(
  anim: Animation,
  progress: number,
  canvas: { width: number; height: number },
  fps: number,
  springFrame: number,
): PresetContribution {
  if (anim.preset === "none") return NEUTRAL;
  const dx = canvas.width * 0.6;
  const dy = canvas.height * 0.6;

  switch (anim.preset) {
    case "fade":
      return { ...NEUTRAL, opacityMul: progress };
    case "slide-left":
      return { ...NEUTRAL, dx: (1 - progress) * dx, opacityMul: progress };
    case "slide-right":
      return { ...NEUTRAL, dx: -(1 - progress) * dx, opacityMul: progress };
    case "slide-up":
      return { ...NEUTRAL, dy: (1 - progress) * dy, opacityMul: progress };
    case "slide-down":
      return { ...NEUTRAL, dy: -(1 - progress) * dy, opacityMul: progress };
    case "zoom-in":
      return { ...NEUTRAL, scaleMul: 0.6 + 0.4 * progress, opacityMul: progress };
    case "zoom-out":
      return { ...NEUTRAL, scaleMul: 1.4 - 0.4 * progress, opacityMul: progress };
    case "blur":
      return { ...NEUTRAL, blur: (1 - progress) * 20, opacityMul: progress };
    case "pop": {
      const s = spring({
        frame: springFrame,
        fps,
        config: { damping: 12, stiffness: 200, mass: 0.8 },
      });
      return { ...NEUTRAL, scaleMul: progress < 1 ? s : 1, opacityMul: Math.min(1, progress * 2) };
    }
    case "wipe-left": {
      const pct = (1 - progress) * 100;
      // Solo recorta cuando hay recorte real; si no, dejaría sin efecto el wipe de salida.
      return pct > 0.01 ? { ...NEUTRAL, clipInsetPct: { side: "right", pct } } : NEUTRAL;
    }
    case "wipe-right": {
      const pct = (1 - progress) * 100;
      return pct > 0.01 ? { ...NEUTRAL, clipInsetPct: { side: "left", pct } } : NEUTRAL;
    }
    default:
      return NEUTRAL;
  }
}

export function getClipDynamics(
  clip: Clip,
  localFrame: number,
  fps: number,
  canvas: { width: number; height: number },
): ClipDynamics {
  // 1. base transform
  const base: Record<AnimatableProperty, number> = {
    x: clip.x,
    y: clip.y,
    scale: clip.scale,
    rotation: clip.rotation,
    opacity: clip.opacity,
    volume: "volume" in clip ? (clip as { volume: number }).volume : 1,
    maskRadius: (clip as { maskRadius?: number }).maskRadius ?? 100,
  };

  // 2. keyframe overrides
  for (const track of clip.keyframeTracks) {
    const v = interpKeyframes(track, localFrame);
    if (v !== null) base[track.property] = v;
  }

  // 3. enter / exit presets
  const inDur = clip.animationIn.durationInFrames;
  const outDur = clip.animationOut.durationInFrames;

  let inProgress = 1;
  if (clip.animationIn.preset !== "none" && inDur > 0) {
    inProgress = interpolate(localFrame, [0, inDur], [0, 1], {
      easing: easingFn(clip.animationIn.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  let outProgress = 1;
  if (clip.animationOut.preset !== "none" && outDur > 0) {
    outProgress = interpolate(
      localFrame,
      [clip.duration - outDur, clip.duration],
      [1, 0],
      {
        easing: easingFn(clip.animationOut.easing),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
  }

  const inC = presetContribution(clip.animationIn, inProgress, canvas, fps, localFrame);
  const outC = presetContribution(
    clip.animationOut,
    outProgress,
    canvas,
    fps,
    Math.max(0, clip.duration - localFrame),
  );

  // 4. effects -> CSS filter
  const filterParts: string[] = [];
  for (const e of clip.effects) filterParts.push(effectToCss(e));
  const blur = inC.blur + outC.blur;
  if (blur > 0.01) filterParts.push(`blur(${blur}px)`);

  // 5. wipe clip-path (in takes priority if present)
  const wipe = inC.clipInsetPct ?? outC.clipInsetPct;
  let clipPath: string | undefined;
  if (wipe) {
    clipPath =
      wipe.side === "right"
        ? `inset(0 ${wipe.pct}% 0 0)`
        : `inset(0 0 0 ${wipe.pct}%)`;
  }

  return {
    x: base.x + inC.dx + outC.dx,
    y: base.y + inC.dy + outC.dy,
    scale: base.scale * inC.scaleMul * outC.scaleMul,
    rotation: base.rotation,
    opacity: base.opacity * inC.opacityMul * outC.opacityMul,
    volume: base.volume,
    maskRadius: Math.max(0, Math.min(100, base.maskRadius)),
    filter: filterParts.length ? filterParts.join(" ") : "none",
    clipPath,
  };
}

function effectToCss(e: Effect): string {
  switch (e.type) {
    case "blur":
      return `blur(${e.value}px)`;
    case "brightness":
      return `brightness(${e.value})`;
    case "contrast":
      return `contrast(${e.value})`;
    case "saturate":
      return `saturate(${e.value})`;
    case "grayscale":
      return `grayscale(${e.value})`;
    case "sepia":
      return `sepia(${e.value})`;
    case "hue-rotate":
      return `hue-rotate(${e.value}deg)`;
    case "invert":
      return `invert(${e.value})`;
    default:
      return "";
  }
}

/** Volumen del clip en un frame dado, considerando keyframes de "volume". */
export function clipVolumeAt(clip: Clip, localFrame: number): number {
  const base = "volume" in clip ? (clip as { volume: number }).volume : 1;
  const track = clip.keyframeTracks.find((k) => k.property === "volume");
  if (!track) return base;
  const v = interpKeyframes(track, localFrame);
  return v === null ? base : v;
}

/** Audio fade gain (0..1) at a given local frame. */
export function audioGain(
  localFrame: number,
  duration: number,
  fadeInFrames: number,
  fadeOutFrames: number,
): number {
  let g = 1;
  if (fadeInFrames > 0) {
    g *= interpolate(localFrame, [0, fadeInFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  if (fadeOutFrames > 0) {
    g *= interpolate(localFrame, [duration - fadeOutFrames, duration], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  return g;
}
