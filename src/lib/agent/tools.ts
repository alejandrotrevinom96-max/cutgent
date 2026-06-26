/**
 * Registro de herramientas del AGENTE EMBEBIDO. Cada tool expone:
 *  - `input_schema`: JSON Schema que ve Claude (define los argumentos válidos).
 *  - `plan(input, doc)`: función PURA (doc dentro → comandos fuera) que construye
 *    los Command y un mensaje de resultado. NO hace I/O → testeable con tsx sin key.
 *
 * La ruta /api/agent/chat hace el I/O: lee el doc (getDocument), llama a cada
 * `plan`, y aplica los comandos con `dispatch(cmd, AGENT_CLIENT_ID)` — el editor
 * abierto se refresca en vivo por el SSE existente. Reusa el MISMO command-bus y
 * los mismos validadores (CommandSchema) que el MCP y la UI: cero contrato nuevo.
 *
 * Sin "server-only" a propósito: este módulo es puro (factory + commands), para
 * poder verificarlo aislado. El acceso a estado/red vive en la ruta.
 */
import { createClip, createTrack, newId } from "../factory";
import { findClip, type Command } from "../commands";
import type { Project } from "../schema";

/** Origin de los comandos del agente embebido. Distinto del clientId del browser
 *  para que el filtro de eco del store NO los suprima → la edición se ve en vivo. */
export const AGENT_CLIENT_ID = "agent_embedded";

export interface ToolPlan {
  commands: Command[];
  message: string;
}

export interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** Puro: dado el input del modelo y el doc actual, devuelve comandos + mensaje.
   *  Lanza Error (con mensaje accionable) si el input es inválido → la ruta lo
   *  convierte en un tool_result is_error para que el modelo se recupere. */
  plan: (input: Record<string, unknown>, doc: Project) => ToolPlan;
}

// --- helpers de JSON Schema (lo que ve Claude) -----------------------------
type Prop = Record<string, unknown>;
const str = (description: string): Prop => ({ type: "string", description });
const num = (description: string): Prop => ({ type: "number", description });
const bool = (description: string): Prop => ({ type: "boolean", description });
const enom = (values: string[], description: string): Prop => ({ type: "string", enum: values, description });
const schema = (properties: Record<string, Prop>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
});

// --- helpers de validación de input (mensajes accionables al modelo) --------
const reqStr = (input: Record<string, unknown>, key: string): string => {
  const v = input[key];
  if (typeof v !== "string" || !v) throw new Error(`Falta el parámetro "${key}" (string).`);
  return v;
};
const reqNum = (input: Record<string, unknown>, key: string): number => {
  const v = input[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Falta el parámetro "${key}" (number).`);
  return v;
};
const optNum = (input: Record<string, unknown>, key: string): number | undefined =>
  typeof input[key] === "number" ? (input[key] as number) : undefined;
const optStr = (input: Record<string, unknown>, key: string): string | undefined =>
  typeof input[key] === "string" && input[key] ? (input[key] as string) : undefined;

const requireTrack = (doc: Project, trackId: string) => {
  const t = doc.tracks.find((x) => x.id === trackId);
  if (!t) throw new Error(`No existe el track "${trackId}". Llama a get_project para ver los ids reales.`);
  return t;
};
const requireClip = (doc: Project, clipId: string) => {
  const f = findClip(doc, clipId);
  if (!f) throw new Error(`No existe el clip "${clipId}". Llama a get_project para ver los ids reales.`);
  return f;
};

/** Pasa por `keys` los props opcionales numéricos/strings presentes en input. */
function pick(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

/** Resumen compacto del documento para que el modelo conozca ids y estado. */
function summarize(doc: Project): unknown {
  return {
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    fps: doc.fps,
    durationInFrames: doc.durationInFrames,
    durationSec: +(doc.durationInFrames / Math.max(1, doc.fps)).toFixed(2),
    backgroundColor: doc.backgroundColor,
    note: "x/y = offset en px desde el CENTRO del lienzo (0,0 = centrado). Tiempos en FRAMES (segundos = frames / fps).",
    tracks: doc.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      muted: t.muted,
      hidden: t.hidden,
      clips: t.clips.map((c) => {
        const cc = c as unknown as Record<string, unknown>;
        return {
          id: c.id,
          type: c.type,
          name: c.name,
          start: c.start,
          duration: c.duration,
          ...(typeof cc.text === "string" ? { text: cc.text } : {}),
          ...(typeof cc.src === "string" && cc.src ? { src: cc.src } : {}),
        };
      }),
    })),
    markers: (doc.markers ?? []).map((m) => ({ id: m.id, frame: m.frame, label: m.label })),
  };
}

// helpers de transform comunes a los add_* visuales
const TRANSFORM_PROPS: Record<string, Prop> = {
  x: num("Offset horizontal en px desde el centro (0 = centrado)."),
  y: num("Offset vertical en px desde el centro (0 = centrado)."),
  scale: num("Escala (1 = tamaño natural)."),
  rotation: num("Rotación en grados."),
  opacity: num("Opacidad 0..1."),
};

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "get_project",
    description:
      "Devuelve el estado ACTUAL del proyecto: dimensiones, fps, duración y el árbol de pistas y clips con sus ids/tipo/start/duration. Llámalo PRIMERO (o cuando dudes del estado) para conocer los ids reales antes de editar.",
    input_schema: schema({}),
    plan: (_input, doc) => ({ commands: [], message: JSON.stringify(summarize(doc), null, 2) }),
  },
  {
    name: "set_project_settings",
    description:
      "Cambia ajustes del proyecto: nombre, dimensiones (width/height en px), fps, duración total (durationInFrames) y color de fondo. Pasa solo lo que quieras cambiar.",
    input_schema: schema({
      name: str("Nombre del proyecto."),
      width: num("Ancho en px."),
      height: num("Alto en px."),
      fps: num("Cuadros por segundo."),
      durationInFrames: num("Duración total en frames."),
      backgroundColor: str("Color de fondo (hex, p.ej. #000000)."),
    }),
    plan: (input) => {
      const patch = pick(input, ["name", "width", "height", "fps", "durationInFrames", "backgroundColor"]);
      if (Object.keys(patch).length === 0) throw new Error("Indica al menos un ajuste a cambiar.");
      return { commands: [{ type: "set_project_settings", patch } as Command], message: `Ajustes actualizados: ${Object.keys(patch).join(", ")}.` };
    },
  },
  {
    name: "add_track",
    description: "Crea una pista nueva. kind 'media' para video/imágenes/texto/formas; 'audio' para audio. Devuelve el id del track.",
    input_schema: schema({
      name: str("Nombre de la pista."),
      kind: enom(["media", "audio"], "Tipo de pista."),
      index: num("Posición (0 = abajo del todo). Por defecto se añade arriba."),
    }),
    plan: (input) => {
      const track = createTrack({ name: optStr(input, "name"), kind: (optStr(input, "kind") as "media" | "audio") ?? "media" });
      const index = optNum(input, "index");
      return { commands: [{ type: "add_track", track, ...(index != null ? { index } : {}) } as Command], message: `Pista creada (trackId: ${track.id}).` };
    },
  },
  {
    name: "update_track",
    description: "Modifica una pista: nombre, mute, ocultar, bloquear, volumen.",
    input_schema: schema(
      {
        trackId: str("Id de la pista."),
        name: str("Nuevo nombre."),
        muted: bool("Silenciar."),
        hidden: bool("Ocultar."),
        locked: bool("Bloquear."),
        volume: num("Volumen 0..1."),
      },
      ["trackId"],
    ),
    plan: (input, doc) => {
      const trackId = reqStr(input, "trackId");
      requireTrack(doc, trackId);
      const patch = pick(input, ["name", "muted", "hidden", "locked", "volume"]);
      if (Object.keys(patch).length === 0) throw new Error("Indica al menos un campo a cambiar.");
      return { commands: [{ type: "update_track", trackId, patch } as Command], message: `Pista ${trackId} actualizada.` };
    },
  },
  {
    name: "remove_track",
    description: "Elimina una pista y todos sus clips.",
    input_schema: schema({ trackId: str("Id de la pista.") }, ["trackId"]),
    plan: (input, doc) => {
      const trackId = reqStr(input, "trackId");
      requireTrack(doc, trackId);
      return { commands: [{ type: "remove_track", trackId } as Command], message: `Pista ${trackId} eliminada.` };
    },
  },
  {
    name: "add_text",
    description: "Añade un clip de TEXTO a una pista. start y duration en frames. x/y = offset desde el centro.",
    input_schema: schema(
      {
        trackId: str("Id de la pista (media)."),
        text: str("Contenido del texto."),
        start: num("Frame de inicio."),
        duration: num("Duración en frames."),
        ...TRANSFORM_PROPS,
        fontSize: num("Tamaño de fuente en px."),
        color: str("Color del texto (hex)."),
        fontWeight: num("Grosor (100..900)."),
        textAlign: enom(["left", "center", "right"], "Alineación."),
      },
      ["trackId", "text", "start", "duration"],
    ),
    plan: (input, doc) => {
      const trackId = reqStr(input, "trackId");
      requireTrack(doc, trackId);
      const clip = createClip("text", {
        text: reqStr(input, "text"),
        start: reqNum(input, "start"),
        duration: reqNum(input, "duration"),
        ...pick(input, ["x", "y", "scale", "rotation", "opacity", "fontSize", "color", "fontWeight", "textAlign"]),
      });
      return { commands: [{ type: "add_clip", trackId, clip } as Command], message: `Texto añadido (clipId: ${clip.id}) en track ${trackId}.` };
    },
  },
  {
    name: "add_video",
    description: "Añade un clip de VIDEO a una pista. src debe ser una URL o ruta servida por la app (p.ej. de un asset importado).",
    input_schema: schema(
      {
        trackId: str("Id de la pista (media)."),
        src: str("URL/ruta del video."),
        start: num("Frame de inicio."),
        duration: num("Duración en frames."),
        ...TRANSFORM_PROPS,
        volume: num("Volumen 0..1."),
        fit: enom(["cover", "contain", "fill"], "Ajuste dentro del lienzo."),
      },
      ["trackId", "src", "start", "duration"],
    ),
    plan: (input, doc) => {
      const trackId = reqStr(input, "trackId");
      requireTrack(doc, trackId);
      const clip = createClip("video", {
        src: reqStr(input, "src"),
        start: reqNum(input, "start"),
        duration: reqNum(input, "duration"),
        ...pick(input, ["x", "y", "scale", "rotation", "opacity", "volume", "fit"]),
      });
      return { commands: [{ type: "add_clip", trackId, clip } as Command], message: `Video añadido (clipId: ${clip.id}) en track ${trackId}.` };
    },
  },
  {
    name: "add_image",
    description: "Añade un clip de IMAGEN a una pista. src debe ser una URL/ruta servida por la app.",
    input_schema: schema(
      {
        trackId: str("Id de la pista (media)."),
        src: str("URL/ruta de la imagen."),
        start: num("Frame de inicio."),
        duration: num("Duración en frames."),
        ...TRANSFORM_PROPS,
        fit: enom(["cover", "contain", "fill"], "Ajuste dentro del lienzo."),
      },
      ["trackId", "src", "start", "duration"],
    ),
    plan: (input, doc) => {
      const trackId = reqStr(input, "trackId");
      requireTrack(doc, trackId);
      const clip = createClip("image", {
        src: reqStr(input, "src"),
        start: reqNum(input, "start"),
        duration: reqNum(input, "duration"),
        ...pick(input, ["x", "y", "scale", "rotation", "opacity", "fit"]),
      });
      return { commands: [{ type: "add_clip", trackId, clip } as Command], message: `Imagen añadida (clipId: ${clip.id}) en track ${trackId}.` };
    },
  },
  {
    name: "add_audio",
    description: "Añade un clip de AUDIO a una pista de audio. src debe ser una URL/ruta servida por la app.",
    input_schema: schema(
      {
        trackId: str("Id de la pista (audio)."),
        src: str("URL/ruta del audio."),
        start: num("Frame de inicio."),
        duration: num("Duración en frames."),
        volume: num("Volumen 0..1."),
      },
      ["trackId", "src", "start", "duration"],
    ),
    plan: (input, doc) => {
      const trackId = reqStr(input, "trackId");
      requireTrack(doc, trackId);
      const clip = createClip("audio", {
        src: reqStr(input, "src"),
        start: reqNum(input, "start"),
        duration: reqNum(input, "duration"),
        ...pick(input, ["volume"]),
      });
      return { commands: [{ type: "add_clip", trackId, clip } as Command], message: `Audio añadido (clipId: ${clip.id}) en track ${trackId}.` };
    },
  },
  {
    name: "add_shape",
    description: "Añade una FORMA (rect/circle/ellipse/triangle/star) a una pista.",
    input_schema: schema(
      {
        trackId: str("Id de la pista (media)."),
        shape: enom(["rect", "circle", "ellipse", "triangle", "star"], "Tipo de forma."),
        start: num("Frame de inicio."),
        duration: num("Duración en frames."),
        fill: str("Color de relleno (hex)."),
        width: num("Ancho en px."),
        height: num("Alto en px."),
        ...TRANSFORM_PROPS,
      },
      ["trackId", "shape", "start", "duration"],
    ),
    plan: (input, doc) => {
      const trackId = reqStr(input, "trackId");
      requireTrack(doc, trackId);
      const clip = createClip("shape", {
        shape: reqStr(input, "shape"),
        start: reqNum(input, "start"),
        duration: reqNum(input, "duration"),
        ...pick(input, ["fill", "width", "height", "x", "y", "scale", "rotation", "opacity"]),
      });
      return { commands: [{ type: "add_clip", trackId, clip } as Command], message: `Forma añadida (clipId: ${clip.id}) en track ${trackId}.` };
    },
  },
  {
    name: "add_solid",
    description: "Añade un fondo de COLOR sólido a una pista (útil como fondo o transición).",
    input_schema: schema(
      {
        trackId: str("Id de la pista (media)."),
        color: str("Color (hex)."),
        start: num("Frame de inicio."),
        duration: num("Duración en frames."),
      },
      ["trackId", "color", "start", "duration"],
    ),
    plan: (input, doc) => {
      const trackId = reqStr(input, "trackId");
      requireTrack(doc, trackId);
      const clip = createClip("solid", {
        color: reqStr(input, "color"),
        start: reqNum(input, "start"),
        duration: reqNum(input, "duration"),
      });
      return { commands: [{ type: "add_clip", trackId, clip } as Command], message: `Fondo sólido añadido (clipId: ${clip.id}).` };
    },
  },
  {
    name: "update_clip",
    description:
      "Modifica propiedades de un clip por id. patch es un objeto libre con los campos a cambiar (x, y, scale, rotation, opacity, text, color, fontSize, src, volume, width, height, fit, start, duration, ...).",
    input_schema: schema(
      {
        clipId: str("Id del clip."),
        patch: { type: "object", description: "Campos a cambiar (objeto libre).", additionalProperties: true },
      },
      ["clipId", "patch"],
    ),
    plan: (input, doc) => {
      const clipId = reqStr(input, "clipId");
      requireClip(doc, clipId);
      const patch = input.patch;
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error('"patch" debe ser un objeto con los campos a cambiar.');
      return { commands: [{ type: "update_clip", clipId, patch } as Command], message: `Clip ${clipId} actualizado.` };
    },
  },
  {
    name: "move_clip",
    description: "Mueve un clip a un nuevo frame de inicio (start) y, opcionalmente, a otra pista (trackId).",
    input_schema: schema(
      {
        clipId: str("Id del clip."),
        start: num("Nuevo frame de inicio."),
        trackId: str("Id de la pista destino (opcional)."),
      },
      ["clipId", "start"],
    ),
    plan: (input, doc) => {
      const clipId = reqStr(input, "clipId");
      requireClip(doc, clipId);
      const start = reqNum(input, "start");
      const trackId = optStr(input, "trackId");
      if (trackId) requireTrack(doc, trackId);
      return { commands: [{ type: "move_clip", clipId, start, ...(trackId ? { trackId } : {}) } as Command], message: `Clip ${clipId} movido a frame ${start}.` };
    },
  },
  {
    name: "remove_clip",
    description: "Elimina un clip por id (deja el hueco; usa ripple en la UI si quieres cerrar).",
    input_schema: schema({ clipId: str("Id del clip.") }, ["clipId"]),
    plan: (input, doc) => {
      const clipId = reqStr(input, "clipId");
      requireClip(doc, clipId);
      return { commands: [{ type: "remove_clip", clipId } as Command], message: `Clip ${clipId} eliminado.` };
    },
  },
  {
    name: "duplicate_clip",
    description: "Duplica un clip; la copia se coloca justo después del original.",
    input_schema: schema({ clipId: str("Id del clip.") }, ["clipId"]),
    plan: (input, doc) => {
      const clipId = reqStr(input, "clipId");
      requireClip(doc, clipId);
      const id = newId("clip");
      return { commands: [{ type: "duplicate_clip", clipId, newId: id } as Command], message: `Clip duplicado (nuevo clipId: ${id}).` };
    },
  },
  {
    name: "split_clip",
    description: "Corta un clip en dos en un frame ABSOLUTO de la línea de tiempo. Devuelve el id de la segunda mitad.",
    input_schema: schema({ clipId: str("Id del clip."), frame: num("Frame absoluto del corte.") }, ["clipId", "frame"]),
    plan: (input, doc) => {
      const clipId = reqStr(input, "clipId");
      requireClip(doc, clipId);
      const frame = reqNum(input, "frame");
      const id = newId("clip");
      return { commands: [{ type: "split_clip", clipId, frame, newId: id } as Command], message: `Clip ${clipId} cortado en frame ${frame} (segunda mitad: ${id}).` };
    },
  },
  {
    name: "add_effect",
    description:
      "Añade un efecto a un clip. type: blur, brightness, contrast, saturate, grayscale, sepia, hue-rotate, invert, glow, vignette, rgb-split, duotone. value = intensidad. params (opcional) según el efecto (p.ej. glow: {threshold, color}; vignette: {feather}; duotone: {shadowColor, highlightColor}).",
    input_schema: schema(
      {
        clipId: str("Id del clip."),
        type: enom(
          ["blur", "brightness", "contrast", "saturate", "grayscale", "sepia", "hue-rotate", "invert", "glow", "vignette", "rgb-split", "duotone"],
          "Tipo de efecto.",
        ),
        value: num("Intensidad del efecto."),
        params: { type: "object", description: "Parámetros opcionales según el efecto.", additionalProperties: true },
      },
      ["clipId", "type", "value"],
    ),
    plan: (input, doc) => {
      const clipId = reqStr(input, "clipId");
      requireClip(doc, clipId);
      const effect: Record<string, unknown> = { type: reqStr(input, "type"), value: reqNum(input, "value") };
      if (input.params && typeof input.params === "object" && !Array.isArray(input.params)) effect.params = input.params;
      return { commands: [{ type: "add_effect", clipId, effect } as Command], message: `Efecto ${effect.type} añadido al clip ${clipId}.` };
    },
  },
  {
    name: "add_marker",
    description: "Añade un marcador/capítulo en un frame de la línea de tiempo.",
    input_schema: schema(
      { frame: num("Frame del marcador."), label: str("Etiqueta."), color: str("Color (hex).") },
      ["frame"],
    ),
    plan: (input) => {
      const frame = reqNum(input, "frame");
      const marker = { id: newId("marker"), frame, label: optStr(input, "label") ?? "Marcador", color: optStr(input, "color") ?? "#ef4444" };
      return { commands: [{ type: "add_marker", marker } as Command], message: `Marcador añadido en frame ${frame} (id: ${marker.id}).` };
    },
  },
];

/** Mapa nombre→tool para lookup en la ruta. */
export const AGENT_TOOLS_BY_NAME: Record<string, AgentTool> = Object.fromEntries(
  AGENT_TOOLS.map((t) => [t.name, t]),
);
