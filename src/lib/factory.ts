import { nanoid } from "nanoid";
import {
  AnimationSchema,
  type Animation,
  type Clip,
  type ClipType,
  type Project,
  type Track,
} from "./schema";

export const newId = (prefix = "id") => `${prefix}_${nanoid(8)}`;

const baseTransform = () => ({
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  animationIn: AnimationSchema.parse({}),
  animationOut: AnimationSchema.parse({}),
  keyframeTracks: [],
  effects: [],
  blendMode: "normal" as const,
  mask: "none" as const,
});

export function createTrack(partial: Partial<Track> = {}): Track {
  return {
    id: partial.id ?? newId("track"),
    name: partial.name ?? "Pista",
    kind: partial.kind ?? "media",
    muted: false,
    hidden: false,
    locked: false,
    volume: 1,
    clips: [],
    ...partial,
  };
}

/**
 * Build a clip of a given type with sensible defaults merged with `partial`.
 * Callers (UI / MCP) pass only what they care about.
 */
export function createClip(type: ClipType, partial: Record<string, unknown> = {}): Clip {
  const base = {
    id: newId("clip"),
    name: defaultName(type),
    start: 0,
    duration: 90,
    ...baseTransform(),
  };

  switch (type) {
    case "video":
      return { type, ...base, src: "", trimStart: 0, volume: 1, muted: false, playbackRate: 1, fadeInFrames: 0, fadeOutFrames: 0, fit: "cover", ...partial } as Clip;
    case "image":
      return { type, ...base, src: "", fit: "cover", ...partial } as Clip;
    case "audio":
      return { type, ...base, src: "", trimStart: 0, volume: 1, playbackRate: 1, fadeInFrames: 0, fadeOutFrames: 0, ...partial } as Clip;
    case "text":
      return {
        type,
        ...base,
        text: "Texto",
        fontFamily: "Inter",
        fontSize: 80,
        fontWeight: 700,
        color: "#ffffff",
        textAlign: "center",
        lineHeight: 1.2,
        letterSpacing: 0,
        italic: false,
        strokeWidth: 0,
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        ...partial,
      } as Clip;
    case "shape":
      return { type, ...base, shape: "rect", fill: "#6366f1", strokeWidth: 0, cornerRadius: 0, ...partial } as Clip;
    case "solid":
      return { type, ...base, color: "#000000", ...partial } as Clip;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function defaultName(type: ClipType): string {
  return {
    video: "Video",
    image: "Imagen",
    audio: "Audio",
    text: "Texto",
    shape: "Forma",
    solid: "Fondo",
  }[type];
}

export const presetAnimation = (over: Partial<Animation> = {}): Animation =>
  AnimationSchema.parse(over);

export function createDefaultProject(): Project {
  const mediaTrack = createTrack({ name: "Pista de video", kind: "media" });
  const overlayTrack = createTrack({ name: "Texto / overlays", kind: "media" });
  const audioTrack = createTrack({ name: "Audio", kind: "audio" });

  const intro = createClip("solid", {
    name: "Fondo",
    color: "#0f172a",
    start: 0,
    duration: 150,
  });
  const title = createClip("text", {
    name: "Título",
    text: "Cutgent",
    start: 15,
    duration: 120,
    fontSize: 160,
    animationIn: presetAnimation({ preset: "pop", durationInFrames: 20 }),
    animationOut: presetAnimation({ preset: "fade", durationInFrames: 15 }),
  });

  mediaTrack.clips.push(intro);
  overlayTrack.clips.push(title);

  return {
    version: 1,
    id: newId("proj"),
    name: "Proyecto sin título",
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: 300,
    backgroundColor: "#000000",
    tracks: [mediaTrack, overlayTrack, audioTrack],
    markers: [],
  };
}
