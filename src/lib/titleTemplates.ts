/**
 * Plantillas de títulos animados (lower-thirds, title cards, callouts…) como
 * funciones puras que devuelven INPUTS para createClip — gemelo de captions.ts.
 * Se apoyan 100% en el sistema de animaciones/keyframes que ya existe
 * (getClipDynamics, presets animationIn/Out), así que NO tocan el render: solo
 * pre-rellenan campos de clips de texto/forma.
 */

export type TitleTemplateId =
  | "lower-third"
  | "title-card"
  | "pop-callout"
  | "kinetic-line"
  | "subtitle-bar"
  | "corner-tag";

export interface TitleCtx {
  fps: number;
  width: number;
  height: number;
  /** Duración en frames (default ~4s). */
  duration?: number;
}

export interface TitleClipInput extends Record<string, unknown> {
  kind: "text" | "shape";
  start: number;
  duration: number;
}

export interface TitleTemplate {
  id: TitleTemplateId;
  label: string;
  /** El shape (si lo hay) va PRIMERO para quedar detrás del texto. */
  build: (text: string, ctx: TitleCtx) => TitleClipInput[];
}

const anim = (preset: string, durationInFrames: number, easing = "ease-out") => ({
  preset,
  durationInFrames,
  easing,
});

export const TITLE_TEMPLATES: Record<TitleTemplateId, TitleTemplate> = {
  "lower-third": {
    id: "lower-third",
    label: "Lower third",
    build: (text, ctx) => {
      const dur = ctx.duration ?? ctx.fps * 5;
      const w = Math.min(900, ctx.width * 0.6);
      const y = ctx.height / 2 - 160;
      const x = -ctx.width / 2 + w / 2 + 80;
      return [
        {
          kind: "shape",
          start: 0,
          duration: dur,
          shape: "rect",
          fill: "#0ea5e9",
          width: w,
          height: 96,
          cornerRadius: 8,
          x,
          y,
          opacity: 0.92,
          animationIn: anim("slide-left", 14),
          animationOut: anim("fade", 12),
        },
        {
          kind: "text",
          start: 2,
          duration: dur - 2,
          text,
          fontSize: 48,
          fontWeight: 700,
          color: "#ffffff",
          textAlign: "left",
          width: w - 48,
          x,
          y,
          animationIn: anim("slide-left", 18),
          animationOut: anim("fade", 12),
        },
      ];
    },
  },

  "title-card": {
    id: "title-card",
    label: "Title card",
    build: (text, ctx) => {
      const dur = ctx.duration ?? ctx.fps * 4;
      return [
        {
          kind: "text",
          start: 0,
          duration: dur,
          text,
          fontSize: Math.round(ctx.height * 0.13),
          fontWeight: 800,
          color: "#ffffff",
          textAlign: "center",
          strokeColor: "#000000",
          strokeWidth: 2,
          x: 0,
          y: 0,
          animationIn: anim("pop", 20, "spring"),
          animationOut: anim("fade", 15),
        },
      ];
    },
  },

  "pop-callout": {
    id: "pop-callout",
    label: "Callout",
    build: (text, ctx) => {
      const dur = ctx.duration ?? ctx.fps * 3;
      return [
        {
          kind: "text",
          start: 0,
          duration: dur,
          text,
          fontSize: Math.round(ctx.height * 0.08),
          fontWeight: 900,
          color: "#fde047",
          textAlign: "center",
          strokeColor: "#000000",
          strokeWidth: 6,
          shadowColor: "#000000",
          shadowBlur: 12,
          shadowOffsetX: 0,
          shadowOffsetY: 4,
          x: 0,
          y: -ctx.height / 4,
          animationIn: anim("pop", 16, "spring"),
          animationOut: anim("zoom-out", 10),
        },
      ];
    },
  },

  "kinetic-line": {
    id: "kinetic-line",
    label: "Kinetic",
    build: (text, ctx) => {
      const dur = ctx.duration ?? ctx.fps * 4;
      // Overshoot sutil via keyframes de escala (kinetic-ish del clip completo).
      return [
        {
          kind: "text",
          start: 0,
          duration: dur,
          text,
          fontSize: Math.round(ctx.height * 0.1),
          fontWeight: 800,
          color: "#ffffff",
          textAlign: "center",
          x: 0,
          y: 0,
          animationIn: anim("slide-up", 14),
          animationOut: anim("fade", 12),
          keyframeTracks: [
            {
              property: "scale",
              keyframes: [
                { frame: 0, value: 0.9, easing: "ease-out" },
                { frame: 8, value: 1.06, easing: "ease-out" },
                { frame: 16, value: 1, easing: "ease-in-out" },
              ],
            },
          ],
        },
      ];
    },
  },

  "subtitle-bar": {
    id: "subtitle-bar",
    label: "Subtítulo",
    build: (text, ctx) => {
      const dur = ctx.duration ?? ctx.fps * 3;
      return [
        {
          kind: "text",
          start: 0,
          duration: dur,
          text,
          fontSize: Math.round(ctx.height * 0.05),
          fontWeight: 700,
          color: "#ffffff",
          backgroundColor: "rgba(0,0,0,0.6)",
          textAlign: "center",
          x: 0,
          y: ctx.height / 2 - 120,
          animationIn: anim("fade", 8),
          animationOut: anim("fade", 8),
        },
      ];
    },
  },

  "corner-tag": {
    id: "corner-tag",
    label: "Etiqueta esquina",
    build: (text, ctx) => {
      const dur = ctx.duration ?? ctx.fps * 6;
      return [
        {
          kind: "text",
          start: 0,
          duration: dur,
          text,
          fontSize: Math.round(ctx.height * 0.035),
          fontWeight: 700,
          color: "#ffffff",
          textAlign: "right",
          x: ctx.width / 2 - 180,
          y: -ctx.height / 2 + 70,
          animationIn: anim("blur", 12),
          animationOut: anim("fade", 10),
        },
      ];
    },
  },
};

export const TITLE_TEMPLATE_LIST = Object.values(TITLE_TEMPLATES);

/** Construye los inputs de una plantilla (helper para UI y validación). */
export function buildTitleInputs(id: TitleTemplateId, text: string, ctx: TitleCtx): TitleClipInput[] {
  const tpl = TITLE_TEMPLATES[id];
  if (!tpl) return [];
  return tpl.build(text || "Texto", ctx);
}
