/**
 * Servidor MCP de Cutgent.
 *
 * Servidor autónomo Node/TypeScript (ejecútalo con `tsx`) que expone TODO el
 * editor de video como herramientas MCP. No importa nada de la app Next: habla
 * con ella exclusivamente por HTTP usando el contrato fijo de /api/*.
 *
 * Cada herramienta construye objetos `Command` JSON planos que cumplen
 * EXACTAMENTE src/lib/commands.ts y los envía a /api/document/command. El
 * documento autoritativo vive en el servidor Next y se transmite por SSE, así
 * que el editor abierto en el navegador refleja los cambios en vivo.
 *
 * Protocolo: stdout es SOLO para el transporte stdio del MCP. Todos los logs
 * van a stderr (console.error).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { nanoid } from "nanoid";
import { readFileSync } from "fs";
import os from "os";
import path from "path";

// ---------------------------------------------------------------------------
// Configuración y helpers HTTP
// ---------------------------------------------------------------------------

/**
 * Descubre a qué URL hablar:
 *  1) CUTGENT_URL si está definido (dev / override),
 *  2) el endpoint que escribe la app de escritorio (Electron usa un puerto
 *     ALEATORIO; lo publica en <userData>/endpoint.json), para que el cliente
 *     de IA pueda conectarse sin saber el puerto,
 *  3) localhost:3000 (dev por defecto).
 */
function readEndpoint(): { url?: string; token?: string } {
  const home = os.homedir();
  const candidates =
    process.platform === "win32"
      ? [path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Cutgent", "endpoint.json")]
      : process.platform === "darwin"
        ? [path.join(home, "Library", "Application Support", "Cutgent", "endpoint.json")]
        : [path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "Cutgent", "endpoint.json")];
  for (const f of candidates) {
    try {
      return JSON.parse(readFileSync(f, "utf8")) as { url?: string; token?: string };
    } catch {
      /* no endpoint file yet */
    }
  }
  return {};
}

function resolveBase(): string {
  return process.env.CUTGENT_URL || readEndpoint().url || "http://localhost:3000";
}

/** Header de auth para el server local (token de la app empaquetada). */
function authHeaders(): Record<string, string> {
  const t = process.env.CUTGENT_TOKEN || readEndpoint().token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Resolución POR LLAMADA (no al cargar el módulo): si el cliente lanza el MCP
// antes de que la app termine de arrancar, endpoint.json aún no existe; resolver
// en cada petición evita quedar clavado en el fallback con el puerto equivocado.
const getBase = (): string => resolveBase();

/**
 * fetch con reintentos ante errores de conexión (la app de escritorio puede
 * estar arrancando todavía). No reintenta respuestas HTTP de error.
 */
async function fetchRetry(url: string, init?: RequestInit, tries = 4): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Genera ids con el mismo formato que src/lib/factory.ts (`prefix_xxxxxxxx`). */
const newId = (prefix = "id"): string => `${prefix}_${nanoid(8)}`;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Comando JSON plano. Lo validamos del lado de Next (applyCommand/schema). */
type Command = Record<string, unknown>;

/** POST de uno o varios comandos al documento autoritativo. */
async function postCommands(commands: Command[]): Promise<unknown> {
  const res = await fetchRetry(`${getBase()}/api/document/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ commands }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST /api/document/command ${res.status}: ${text}`);
  }
  return text ? safeJson(text) : null;
}

/** GET genérico que devuelve JSON. */
async function getJson(path: string): Promise<unknown> {
  const res = await fetchRetry(`${getBase()}${path}`, { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET ${path} ${res.status}: ${text}`);
  }
  return text ? safeJson(text) : null;
}

/** POST genérico con cuerpo JSON. */
async function postJson(path: string, body: unknown): Promise<unknown> {
  const res = await fetchRetry(`${getBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST ${path} ${res.status}: ${text}`);
  }
  return text ? safeJson(text) : null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Respuestas MCP
// ---------------------------------------------------------------------------

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const okJson = (value: unknown): ToolResult => ok(JSON.stringify(value, null, 2));
const fail = (err: unknown): ToolResult => ({
  content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
  isError: true,
});

/** Envuelve un handler para capturar errores como respuestas MCP de error. */
function tool<A>(fn: (args: A) => Promise<ToolResult>): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (err) {
      return fail(err);
    }
  };
}

// ---------------------------------------------------------------------------
// Constructores de bloques de clip (cumplen schema.ts; ids generados aquí)
// ---------------------------------------------------------------------------

const ANIM_PRESETS = [
  "none",
  "fade",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "zoom-in",
  "zoom-out",
  "pop",
  "blur",
  "wipe-left",
  "wipe-right",
] as const;

const EASINGS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "spring"] as const;

const EFFECT_TYPES = [
  "blur",
  "brightness",
  "contrast",
  "saturate",
  "grayscale",
  "sepia",
  "hue-rotate",
  "invert",
] as const;

const ANIMATABLE = ["x", "y", "scale", "rotation", "opacity", "volume"] as const;
const SHAPE_KINDS = ["rect", "circle", "ellipse", "triangle", "star"] as const;
const FITS = ["cover", "contain", "fill"] as const;

/** Animación con todos los campos requeridos. */
function animation(preset: string = "none", durationInFrames = 15, easing = "ease-in-out") {
  return { preset, durationInFrames, easing };
}

interface ClipBase {
  id: string;
  name: string;
  start: number;
  duration: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  width?: number;
  height?: number;
  animationIn: ReturnType<typeof animation>;
  animationOut: ReturnType<typeof animation>;
  keyframeTracks: unknown[];
  effects: unknown[];
}

/** Campos base (transform + timeline) compartidos por TODOS los clips. */
function baseClip(opts: {
  name: string;
  start: number;
  duration: number;
  x?: number;
  y?: number;
  animationInPreset?: string;
  animationOutPreset?: string;
}): ClipBase {
  return {
    id: newId("clip"),
    name: opts.name,
    start: opts.start,
    duration: opts.duration,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    animationIn: animation(opts.animationInPreset ?? "none"),
    animationOut: animation(opts.animationOutPreset ?? "none"),
    keyframeTracks: [],
    effects: [],
  };
}

/** Track completo con todos los campos por defecto (equivalente a createTrack). */
function buildTrack(opts: { name?: string; kind?: "media" | "audio" }): Record<string, unknown> {
  const kind = opts.kind ?? "media";
  return {
    id: newId("track"),
    name: opts.name ?? (kind === "audio" ? "Audio" : "Pista"),
    kind,
    muted: false,
    hidden: false,
    locked: false,
    volume: 1,
    clips: [],
  };
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "cutgent", version: "1.0.0" });

// ---- Proyecto -------------------------------------------------------------

server.registerTool(
  "get_project",
  {
    title: "Obtener proyecto",
    description:
      "Devuelve un resumen del documento actual: dimensiones, fps, duración, número de tracks/clips y el árbol con id/tipo/start/duration de cada clip.",
    inputSchema: {},
  },
  tool(async () => {
    const doc = (await getJson("/api/document")) as {
      id?: string;
      name?: string;
      width?: number;
      height?: number;
      fps?: number;
      durationInFrames?: number;
      backgroundColor?: string;
      tracks?: {
        id: string;
        name: string;
        kind: string;
        clips: { id: string; type: string; start: number; duration: number; name?: string }[];
      }[];
    } | null;
    if (!doc) return ok("No hay documento.");
    const tracks = doc.tracks ?? [];
    const summary = {
      id: doc.id,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      fps: doc.fps,
      durationInFrames: doc.durationInFrames,
      backgroundColor: doc.backgroundColor,
      trackCount: tracks.length,
      clipCount: tracks.reduce((n, t) => n + t.clips.length, 0),
      tracks: tracks.map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        clips: t.clips.map((c) => ({
          id: c.id,
          type: c.type,
          name: c.name,
          start: c.start,
          duration: c.duration,
        })),
      })),
    };
    return okJson(summary);
  }),
);

server.registerTool(
  "set_project_settings",
  {
    title: "Ajustes del proyecto",
    description:
      "Cambia ajustes globales del proyecto (nombre, ancho, alto, fps, duración en frames, color de fondo).",
    inputSchema: {
      name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      fps: z.number().optional(),
      durationInFrames: z.number().optional(),
      backgroundColor: z.string().optional(),
    },
  },
  tool(async (args) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "width", "height", "fps", "durationInFrames", "backgroundColor"] as const) {
      if (args[k] !== undefined) patch[k] = args[k];
    }
    if (Object.keys(patch).length === 0) return ok("Nada que cambiar.");
    await postCommands([{ type: "set_project_settings", patch }]);
    return ok(`Ajustes actualizados: ${JSON.stringify(patch)}`);
  }),
);

// ---- Tracks ---------------------------------------------------------------

server.registerTool(
  "list_tracks",
  {
    title: "Listar pistas",
    description: "Lista las pistas del proyecto con su id, nombre, tipo y número de clips.",
    inputSchema: {},
  },
  tool(async () => {
    const doc = (await getJson("/api/document")) as {
      tracks?: { id: string; name: string; kind: string; muted: boolean; hidden: boolean; locked: boolean; volume: number; clips: unknown[] }[];
    } | null;
    const tracks = doc?.tracks ?? [];
    return okJson(
      tracks.map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        muted: t.muted,
        hidden: t.hidden,
        locked: t.locked,
        volume: t.volume,
        clipCount: t.clips.length,
      })),
    );
  }),
);

server.registerTool(
  "add_track",
  {
    title: "Añadir pista",
    description:
      "Crea una pista nueva. kind 'media' para capas visuales (video/imagen/texto/forma/fondo), 'audio' para sonido. index opcional para posición (0 = capa de abajo). Devuelve el trackId.",
    inputSchema: {
      name: z.string().optional(),
      kind: z.enum(["media", "audio"]).optional(),
      index: z.number().optional(),
    },
  },
  tool(async (args) => {
    const track = buildTrack({ name: args.name, kind: args.kind });
    const command: Command = { type: "add_track", track };
    if (args.index !== undefined) command.index = args.index;
    await postCommands([command]);
    return ok(`Pista creada. trackId=${track.id as string}`);
  }),
);

server.registerTool(
  "remove_track",
  {
    title: "Eliminar pista",
    description: "Elimina una pista (y todos sus clips) por id.",
    inputSchema: { trackId: z.string() },
  },
  tool(async (args) => {
    await postCommands([{ type: "remove_track", trackId: args.trackId }]);
    return ok(`Pista ${args.trackId} eliminada.`);
  }),
);

server.registerTool(
  "update_track",
  {
    title: "Actualizar pista",
    description: "Actualiza propiedades de una pista: nombre, muted, hidden, locked, volumen (0..1).",
    inputSchema: {
      trackId: z.string(),
      name: z.string().optional(),
      muted: z.boolean().optional(),
      hidden: z.boolean().optional(),
      locked: z.boolean().optional(),
      volume: z.number().min(0).max(1).optional(),
    },
  },
  tool(async (args) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "muted", "hidden", "locked", "volume"] as const) {
      if (args[k] !== undefined) patch[k] = args[k];
    }
    if (Object.keys(patch).length === 0) return ok("Nada que cambiar.");
    await postCommands([{ type: "update_track", trackId: args.trackId, patch }]);
    return ok(`Pista ${args.trackId} actualizada: ${JSON.stringify(patch)}`);
  }),
);

server.registerTool(
  "reorder_track",
  {
    title: "Reordenar pista",
    description:
      "Mueve una pista a otra posición (orden de composición). index 0 = capa de abajo; índices mayores quedan por encima (se dibujan al frente).",
    inputSchema: { trackId: z.string(), index: z.coerce.number().int().min(0) },
  },
  tool(async (args) => {
    await postCommands([{ type: "reorder_track", trackId: args.trackId, index: args.index }]);
    return ok(`Pista ${args.trackId} movida al índice ${args.index}.`);
  }),
);

// ---- Añadir clips ---------------------------------------------------------

server.registerTool(
  "add_text",
  {
    title: "Añadir texto",
    description:
      "Añade un clip de texto a una pista. Coordenadas x/y en px desde el centro. Tiempos en frames. Devuelve el clipId.",
    inputSchema: {
      trackId: z.string(),
      text: z.string(),
      start: z.number(),
      duration: z.number(),
      x: z.number().optional(),
      y: z.number().optional(),
      fontSize: z.number().optional(),
      color: z.string().optional(),
      fontWeight: z.number().optional(),
      textAlign: z.enum(["left", "center", "right"]).optional(),
      animationInPreset: z.enum(ANIM_PRESETS).optional(),
      animationOutPreset: z.enum(ANIM_PRESETS).optional(),
    },
  },
  tool(async (args) => {
    const clip = {
      type: "text",
      ...baseClip({
        name: "Texto",
        start: args.start,
        duration: args.duration,
        x: args.x,
        y: args.y,
        animationInPreset: args.animationInPreset,
        animationOutPreset: args.animationOutPreset,
      }),
      text: args.text,
      fontFamily: "Inter",
      fontSize: args.fontSize ?? 80,
      fontWeight: args.fontWeight ?? 700,
      color: args.color ?? "#ffffff",
      textAlign: args.textAlign ?? "center",
      lineHeight: 1.2,
      letterSpacing: 0,
      italic: false,
      strokeWidth: 0,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    };
    await postCommands([{ type: "add_clip", trackId: args.trackId, clip }]);
    return ok(`Texto añadido. clipId=${clip.id as string}`);
  }),
);

server.registerTool(
  "add_image",
  {
    title: "Añadir imagen",
    description: "Añade un clip de imagen a una pista. fit: cover|contain|fill. Devuelve el clipId.",
    inputSchema: {
      trackId: z.string(),
      src: z.string(),
      start: z.number(),
      duration: z.number(),
      x: z.number().optional(),
      y: z.number().optional(),
      fit: z.enum(FITS).optional(),
    },
  },
  tool(async (args) => {
    const clip = {
      type: "image",
      ...baseClip({ name: "Imagen", start: args.start, duration: args.duration, x: args.x, y: args.y }),
      src: args.src,
      fit: args.fit ?? "cover",
    };
    await postCommands([{ type: "add_clip", trackId: args.trackId, clip }]);
    return ok(`Imagen añadida. clipId=${clip.id as string}`);
  }),
);

server.registerTool(
  "add_video",
  {
    title: "Añadir video",
    description:
      "Añade un clip de video a una pista. volume 0..1. fit: cover|contain|fill. Devuelve el clipId.",
    inputSchema: {
      trackId: z.string(),
      src: z.string(),
      start: z.number(),
      duration: z.number(),
      x: z.number().optional(),
      y: z.number().optional(),
      volume: z.number().min(0).max(1).optional(),
      fit: z.enum(FITS).optional(),
    },
  },
  tool(async (args) => {
    const clip = {
      type: "video",
      ...baseClip({ name: "Video", start: args.start, duration: args.duration, x: args.x, y: args.y }),
      src: args.src,
      trimStart: 0,
      volume: args.volume ?? 1,
      muted: false,
      playbackRate: 1,
      fit: args.fit ?? "cover",
    };
    await postCommands([{ type: "add_clip", trackId: args.trackId, clip }]);
    return ok(`Video añadido. clipId=${clip.id as string}`);
  }),
);

server.registerTool(
  "add_audio",
  {
    title: "Añadir audio",
    description: "Añade un clip de audio a una pista (preferible kind 'audio'). volume 0..1. Devuelve el clipId.",
    inputSchema: {
      trackId: z.string(),
      src: z.string(),
      start: z.number(),
      duration: z.number(),
      volume: z.number().min(0).max(1).optional(),
    },
  },
  tool(async (args) => {
    const clip = {
      type: "audio",
      ...baseClip({ name: "Audio", start: args.start, duration: args.duration }),
      src: args.src,
      trimStart: 0,
      volume: args.volume ?? 1,
      playbackRate: 1,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    };
    await postCommands([{ type: "add_clip", trackId: args.trackId, clip }]);
    return ok(`Audio añadido. clipId=${clip.id as string}`);
  }),
);

server.registerTool(
  "add_shape",
  {
    title: "Añadir forma",
    description:
      "Añade un clip de forma (rect|circle|ellipse|triangle|star). fill es color de relleno. width/height en px opcionales. Devuelve el clipId.",
    inputSchema: {
      trackId: z.string(),
      shape: z.enum(SHAPE_KINDS),
      start: z.number(),
      duration: z.number(),
      fill: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    },
  },
  tool(async (args) => {
    const base = baseClip({ name: "Forma", start: args.start, duration: args.duration, x: args.x, y: args.y });
    if (args.width !== undefined) base.width = args.width;
    if (args.height !== undefined) base.height = args.height;
    const clip = {
      type: "shape",
      ...base,
      shape: args.shape,
      fill: args.fill ?? "#6366f1",
      strokeWidth: 0,
      cornerRadius: 0,
    };
    await postCommands([{ type: "add_clip", trackId: args.trackId, clip }]);
    return ok(`Forma añadida. clipId=${clip.id as string}`);
  }),
);

server.registerTool(
  "add_solid",
  {
    title: "Añadir fondo sólido",
    description: "Añade un clip de color sólido a pantalla completa. Devuelve el clipId.",
    inputSchema: {
      trackId: z.string(),
      color: z.string(),
      start: z.number(),
      duration: z.number(),
    },
  },
  tool(async (args) => {
    const clip = {
      type: "solid",
      ...baseClip({ name: "Fondo", start: args.start, duration: args.duration }),
      color: args.color,
    };
    await postCommands([{ type: "add_clip", trackId: args.trackId, clip }]);
    return ok(`Fondo añadido. clipId=${clip.id as string}`);
  }),
);

// ---- Editar clips ---------------------------------------------------------

server.registerTool(
  "update_clip",
  {
    title: "Actualizar clip",
    description:
      "Aplica un patch libre a un clip (x, y, scale, rotation, opacity, text, color, fontSize, src, volume, width, height, fit, etc.). El servidor fusiona superficialmente.",
    inputSchema: {
      clipId: z.string(),
      patch: z.record(z.string(), z.any()),
    },
  },
  tool(async (args) => {
    await postCommands([{ type: "update_clip", clipId: args.clipId, patch: args.patch }]);
    return ok(`Clip ${args.clipId} actualizado: ${JSON.stringify(args.patch)}`);
  }),
);

server.registerTool(
  "remove_clip",
  {
    title: "Eliminar clip",
    description: "Elimina un clip por id.",
    inputSchema: { clipId: z.string() },
  },
  tool(async (args) => {
    await postCommands([{ type: "remove_clip", clipId: args.clipId }]);
    return ok(`Clip ${args.clipId} eliminado.`);
  }),
);

server.registerTool(
  "move_clip",
  {
    title: "Mover clip",
    description:
      "Mueve un clip a una nueva posición de inicio (frames) y, opcionalmente, a otra pista (trackId).",
    inputSchema: {
      clipId: z.string(),
      start: z.number(),
      trackId: z.string().optional(),
    },
  },
  tool(async (args) => {
    // El reducer clampa start a >=0; reportamos el valor REALMENTE aplicado
    // (antes el mensaje mentía con el valor pedido, p.ej. -200).
    const start = Math.max(0, args.start);
    const command: Command = { type: "move_clip", clipId: args.clipId, start };
    if (args.trackId !== undefined) command.trackId = args.trackId;
    await postCommands([command]);
    return ok(
      `Clip ${args.clipId} movido a start=${start}` +
        (start !== args.start ? ` (ajustado desde ${args.start})` : "") +
        (args.trackId ? ` (track ${args.trackId})` : "") + ".",
    );
  }),
);

server.registerTool(
  "duplicate_clip",
  {
    title: "Duplicar clip",
    description: "Duplica un clip; la copia se coloca justo después del original. Devuelve el nuevo clipId.",
    inputSchema: { clipId: z.string() },
  },
  tool(async (args) => {
    const id = newId("clip");
    await postCommands([{ type: "duplicate_clip", clipId: args.clipId, newId: id }]);
    return ok(`Clip duplicado. nuevo clipId=${id}`);
  }),
);

server.registerTool(
  "split_clip",
  {
    title: "Cortar clip",
    description:
      "Corta un clip en un frame absoluto de la línea de tiempo. La segunda mitad recibe un nuevo id (devuelto).",
    inputSchema: {
      clipId: z.string(),
      frame: z.number(),
    },
  },
  tool(async (args) => {
    // Validar que el frame cae DENTRO del clip antes de generar id: el reducer
    // hace no-op si está fuera de rango, pero antes el tool devolvía igual un
    // clipId (de un clip que nunca existió) → falso éxito.
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    const start = f.clip.start as number;
    const end = start + (f.clip.duration as number);
    if (args.frame <= start || args.frame >= end) {
      return ok(`No se pudo cortar: el frame ${args.frame} está fuera del clip (${start}–${end}).`);
    }
    const id = newId("clip");
    await postCommands([{ type: "split_clip", clipId: args.clipId, frame: args.frame, newId: id }]);
    return ok(`Clip cortado en frame ${args.frame}. segunda mitad clipId=${id}`);
  }),
);

// ---- Animaciones / keyframes / efectos ------------------------------------

const animationInput = z.object({
  preset: z.enum(ANIM_PRESETS),
  durationInFrames: z.number(),
  easing: z.enum(EASINGS),
});

server.registerTool(
  "set_animation",
  {
    title: "Animación de entrada/salida",
    description:
      "Define la animación de entrada (in) y/o salida (out) de un clip. Presets: none, fade, slide-*, zoom-in/out, pop, blur, wipe-*.",
    inputSchema: {
      clipId: z.string(),
      in: animationInput.optional(),
      out: animationInput.optional(),
    },
  },
  tool(async (args) => {
    if (!args.in && !args.out) return ok("Indica al menos una animación (in u out).");
    const command: Command = { type: "set_animation", clipId: args.clipId };
    if (args.in) command.in = args.in;
    if (args.out) command.out = args.out;
    await postCommands([command]);
    return ok(`Animación de ${args.clipId} actualizada.`);
  }),
);

server.registerTool(
  "add_keyframe",
  {
    title: "Añadir keyframe",
    description:
      "Añade (o reemplaza) un keyframe en una propiedad animable de un clip. frame es relativo al inicio del clip (0 = primer frame).",
    inputSchema: {
      clipId: z.string(),
      property: z.enum(ANIMATABLE),
      frame: z.number().min(0),
      value: z.number(),
      easing: z.enum(EASINGS).optional(),
    },
  },
  tool(async (args) => {
    const keyframe = {
      frame: args.frame,
      value: args.value,
      easing: args.easing ?? "ease-in-out",
    };
    await postCommands([
      { type: "add_keyframe", clipId: args.clipId, property: args.property, keyframe },
    ]);
    return ok(`Keyframe ${args.property}@${args.frame}=${args.value} añadido a ${args.clipId}.`);
  }),
);

server.registerTool(
  "remove_keyframe",
  {
    title: "Eliminar keyframe",
    description: "Elimina el keyframe de una propiedad en un frame concreto (relativo al inicio del clip).",
    inputSchema: {
      clipId: z.string(),
      property: z.enum(ANIMATABLE),
      frame: z.number(),
    },
  },
  tool(async (args) => {
    await postCommands([
      { type: "remove_keyframe", clipId: args.clipId, property: args.property, frame: args.frame },
    ]);
    return ok(`Keyframe ${args.property}@${args.frame} eliminado de ${args.clipId}.`);
  }),
);

server.registerTool(
  "add_effect",
  {
    title: "Añadir efecto",
    description:
      "Añade un efecto/filtro CSS al clip. value: px (blur), grados (hue-rotate), multiplicador 0..n (brightness/contrast/saturate), 0..1 (grayscale/sepia/invert).",
    inputSchema: {
      clipId: z.string(),
      type: z.enum(EFFECT_TYPES),
      value: z.number(),
    },
  },
  tool(async (args) => {
    await postCommands([
      { type: "add_effect", clipId: args.clipId, effect: { type: args.type, value: args.value } },
    ]);
    return ok(`Efecto ${args.type}=${args.value} añadido a ${args.clipId}.`);
  }),
);

server.registerTool(
  "remove_effect",
  {
    title: "Eliminar efecto",
    description: "Elimina el efecto en la posición `index` (0 = primer efecto) de un clip.",
    inputSchema: {
      clipId: z.string(),
      index: z.number(),
    },
  },
  tool(async (args) => {
    await postCommands([{ type: "remove_effect", clipId: args.clipId, index: args.index }]);
    return ok(`Efecto #${args.index} eliminado de ${args.clipId}.`);
  }),
);

// ---- Assets ---------------------------------------------------------------

server.registerTool(
  "import_asset",
  {
    title: "Importar asset",
    description:
      "Registra un asset (video/imagen/audio) en el proyecto a partir de una URL/ruta servible. Devuelve el asset creado.",
    inputSchema: {
      name: z.string(),
      kind: z.enum(["video", "image", "audio"]),
      src: z.string(),
    },
  },
  tool(async (args) => {
    const asset = { id: newId("asset"), name: args.name, kind: args.kind, src: args.src };
    const created = await postJson("/api/assets", { asset });
    return okJson(created ?? asset);
  }),
);

server.registerTool(
  "list_assets",
  {
    title: "Listar assets",
    description: "Lista los assets conocidos del proyecto.",
    inputSchema: {},
  },
  tool(async () => {
    const assets = await getJson("/api/assets");
    return okJson(assets ?? []);
  }),
);

// ---- Render ---------------------------------------------------------------

server.registerTool(
  "render_video",
  {
    title: "Renderizar video",
    description:
      "Lanza un render del proyecto actual. format: h264 (mp4, def) | prores (.mov) | vp9 (.webm) | gif. quality: high|balanced|fast (CRF, solo h264/vp9). gpu: usa encoder por hardware (nvenc/qsv/amf) si está disponible (solo h264). width+height (los DOS juntos): render a una resolución distinta a la del proyecto (p.ej. 1280x720 para un export rápido/ligero). Devuelve el jobId.",
    inputSchema: {
      format: z.enum(["h264", "prores", "vp9", "gif"]).optional(),
      quality: z.enum(["high", "balanced", "fast"]).optional(),
      gpu: z.boolean().optional(),
      width: z.coerce.number().int().positive().optional(),
      height: z.coerce.number().int().positive().optional(),
    },
  },
  tool(async (args) => {
    const res = (await postJson("/api/render", {
      format: args.format,
      quality: args.quality,
      gpu: args.gpu,
      width: args.width,
      height: args.height,
    })) as { jobId?: string } | null;
    const jobId = res?.jobId;
    if (!jobId) return okJson(res);
    return ok(`Render lanzado (${args.format ?? "h264"}). jobId=${jobId}`);
  }),
);

server.registerTool(
  "export_poster",
  {
    title: "Exportar miniatura / poster",
    description:
      "Exporta UN frame del proyecto como imagen (miniatura para YouTube). format: jpeg (def) | png. Devuelve la url.",
    inputSchema: { frame: z.number().optional(), format: z.enum(["jpeg", "png"]).optional() },
  },
  tool(async (args) => {
    return okJson(await postJson("/api/render/still", { frame: args.frame ?? 0, format: args.format ?? "jpeg" }));
  }),
);

server.registerTool(
  "export_nle",
  {
    title: "Exportar XML para editor (Premiere / DaVinci Resolve)",
    description:
      "Exporta la línea de tiempo como XML de NLE para CONTINUAR el proyecto en otro editor. format: fcp7 (def — importa nativo en Premiere y DaVinci Resolve). " +
      "Incluye video/imagen/audio con in/out/posición y velocidad; el texto va como generador (puede no conservar estilo); formas/sólidos se omiten; no hay round-trip de efectos/color/transform. Devuelve el XML.",
    inputSchema: { format: z.enum(["fcp7", "fcpxml"]).optional() },
  },
  tool(async (args) => {
    const res = await fetchRetry(`${getBase()}/api/export/nle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ format: args.format ?? "fcp7" }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`POST /api/export/nle ${res.status}: ${text}`);
    const wh = res.headers.get("X-Cutgent-Warnings");
    let warnNote = "";
    if (wh) {
      try {
        const ws = JSON.parse(decodeURIComponent(wh)) as string[];
        if (ws.length) warnNote = `\n\n[Avisos de export (${ws.length})]\n- ${ws.join("\n- ")}`;
      } catch { /* ignore */ }
    }
    return ok(text + warnNote);
  }),
);

server.registerTool(
  "render_status",
  {
    title: "Estado del render",
    description:
      "Consulta el estado de un render por jobId: status (idle|rendering|done|error), progress (0..1), url del MP4 si está listo.",
    inputSchema: { jobId: z.string() },
  },
  tool(async (args) => {
    const status = await getJson(`/api/render/status?id=${encodeURIComponent(args.jobId)}`);
    return okJson(status);
  }),
);

server.registerTool(
  "export_batch",
  {
    title: "Exportar en lote (varios formatos)",
    description:
      "Exporta el proyecto a VARIOS formatos/resoluciones de una, en serie (reusa un solo bundle). presets: ids sociales (yt-1080p, yt-4k, shorts, square, portrait45, web-vp9, gif) y/o items personalizados {format,quality,gpu,width,height,label}. Cada item es un re-render completo. Devuelve batchId (consulta con batch_status). OJO: multi-resolución NO recoloca clips — usa reframe_clips antes si hace falta.",
    inputSchema: {
      presets: z.array(z.string()).optional(),
      items: z.array(z.object({
        format: z.enum(["h264", "prores", "vp9", "gif"]).optional(),
        quality: z.enum(["high", "balanced", "fast"]).optional(),
        gpu: z.boolean().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        label: z.string().optional(),
      })).optional(),
    },
  },
  tool(async (args) => {
    const res = (await postJson("/api/render/batch", { presetIds: args.presets, items: args.items })) as { batchId?: string; jobIds?: string[]; error?: string };
    if (!res?.batchId) return okJson(res);
    return ok(`Lote lanzado. batchId=${res.batchId} (${res.jobIds?.length ?? 0} exportaciones). Consulta con batch_status.`);
  }),
);

server.registerTool(
  "batch_status",
  {
    title: "Estado del export en lote",
    description:
      "Estado de un export por lotes (batchId): status agregado + por item (label, status, progress, url). Las URLs de los archivos listos vienen en el texto.",
    inputSchema: { batchId: z.string() },
  },
  tool(async (args) => {
    const s = (await getJson(`/api/render/batch/status?id=${encodeURIComponent(args.batchId)}`)) as {
      status?: string; done?: number; total?: number; items?: { label: string; status: string; progress: number; url?: string; error?: string }[];
    };
    if (!s?.items) return okJson(s);
    const lines = s.items.map((i) => `${i.status === "done" ? "✓" : i.status === "error" ? "✗" : "…"} ${i.label}: ${i.url ? getBase() + i.url : i.error || Math.round((i.progress || 0) * 100) + "%"}`);
    return ok(`Lote ${s.status} (${s.done}/${s.total}):\n${lines.join("\n")}`);
  }),
);

server.registerTool(
  "generate_media",
  {
    title: "Generar media con IA (BYO key)",
    description:
      "Genera imagen/video/audio con un proveedor usando la API key del usuario (Replicate, fal, OpenAI) y lo registra como asset. " +
      "provider: replicate|fal|openai. kind: image|video|audio. Devuelve jobId (consulta con generate_status). " +
      "COSTE: se factura DIRECTO al usuario en su proveedor, sin markup. Requiere la API key configurada en Ajustes. " +
      "Tras done usa add_generated_media o add_clip para ponerlo en la línea de tiempo.",
    inputSchema: {
      provider: z.enum(["replicate", "fal", "openai"]),
      kind: z.enum(["image", "video", "audio"]),
      prompt: z.string(),
      model: z.string().optional(),
      imageUrl: z.string().optional(),
      durationSec: z.number().optional(),
      voiceId: z.string().optional(),
      aspectRatio: z.string().optional(),
    },
  },
  tool(async (args) => {
    const res = (await postJson("/api/generate", args)) as { jobId?: string } | null;
    const jobId = res?.jobId;
    if (!jobId) return okJson(res);
    return ok(`Generación lanzada (${args.provider}/${args.kind}). jobId=${jobId}. Consulta con generate_status.`);
  }),
);

server.registerTool(
  "generate_status",
  {
    title: "Estado de generación",
    description:
      "Consulta una generación por jobId: status (generating|done|error), progress (0..1), y el asset {id,src,kind,...} cuando esté listo. " +
      "Tras done, usa add_generated_media o add_clip para colocarlo en la línea de tiempo.",
    inputSchema: { jobId: z.string() },
  },
  tool(async (args) => okJson(await getJson(`/api/generate/status?id=${encodeURIComponent(args.jobId)}`))),
);

// ---------------------------------------------------------------------------
// Consulta de documento (lectura)
// ---------------------------------------------------------------------------

interface DocClip {
  id: string;
  type: string;
  name: string;
  start: number;
  duration: number;
  x: number;
  y: number;
  effects?: { type: string; value: number }[];
  text?: string;
  [k: string]: unknown;
}
interface DocTrack { id: string; name: string; kind: string; clips: DocClip[] }
interface Doc {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  backgroundColor: string;
  tracks: DocTrack[];
}

async function getDoc(): Promise<Doc> {
  return (await getJson("/api/document")) as Doc;
}
function locateClip(doc: Doc, clipId: string): { track: DocTrack; clip: DocClip } | null {
  for (const track of doc.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}
const CLIP_TYPES = ["video", "image", "audio", "text", "shape", "solid"] as const;

// ---- Proyecto: presets y nuevo proyecto -----------------------------------

const RES_PRESETS = {
  "youtube-1080p": { width: 1920, height: 1080, fps: 30 },
  "youtube-1080p60": { width: 1920, height: 1080, fps: 60 },
  "youtube-4k": { width: 3840, height: 2160, fps: 30 },
  shorts: { width: 1080, height: 1920, fps: 30 },
  square: { width: 1080, height: 1080, fps: 30 },
} as const;

server.registerTool(
  "new_project",
  {
    title: "Nuevo proyecto",
    description:
      "Reemplaza el documento por un proyecto nuevo y vacío (3 pistas: video, overlays y audio). Útil para empezar un video desde cero.",
    inputSchema: {
      name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      fps: z.number().optional(),
      durationInFrames: z.number().optional(),
    },
  },
  tool(async (args) => {
    const document = {
      version: 1,
      id: newId("proj"),
      name: args.name ?? "Proyecto sin título",
      width: args.width ?? 1920,
      height: args.height ?? 1080,
      fps: args.fps ?? 30,
      durationInFrames: args.durationInFrames ?? 300,
      backgroundColor: "#000000",
      tracks: [
        buildTrack({ name: "Video", kind: "media" }),
        buildTrack({ name: "Texto / overlays", kind: "media" }),
        buildTrack({ name: "Audio", kind: "audio" }),
      ],
    };
    const meta = (await postJson("/api/projects", {
      name: document.name,
      kind: "editor",
      document,
    })) as { id?: string } | null;
    if (meta?.id) await postJson("/api/projects/open", { id: meta.id });
    return ok(
      `Proyecto nuevo creado y abierto (${document.width}x${document.height} @${document.fps}fps). id=${meta?.id}`,
    );
  }),
);

// ---- Proyectos (multi-proyecto) -------------------------------------------

server.registerTool(
  "list_projects",
  { title: "Listar proyectos", description: "Lista todos los proyectos y cuál es el actual.", inputSchema: {} },
  tool(async () => okJson(await getJson("/api/projects"))),
);

server.registerTool(
  "create_project",
  {
    title: "Crear proyecto",
    description:
      "Crea un proyecto nuevo y LO ABRE (pasa a ser el actual). Devuelve su metadata (id). open:false lo crea sin abrirlo (p.ej. para crear muchos clips virales en lote). Para clips usa kind='clip' y sourceId del fuente.",
    inputSchema: {
      name: z.string().optional(),
      kind: z.enum(["editor", "clip"]).optional(),
      sourceId: z.string().optional(),
      open: z.boolean().optional(),
    },
  },
  tool(async (args) => {
    const meta = (await postJson("/api/projects", {
      name: args.name,
      kind: args.kind,
      sourceId: args.sourceId,
    })) as { id?: string } | null;
    // Por defecto abrimos el proyecto recién creado (lo esperado al editar).
    // open:false preserva el comportamiento de "crear sin cambiar el actual".
    if (meta?.id && args.open !== false) {
      await postJson("/api/projects/open", { id: meta.id });
    }
    return okJson(meta);
  }),
);

server.registerTool(
  "open_project",
  {
    title: "Abrir proyecto",
    description: "Abre (hace actual) un proyecto por id. El editor pasa a mostrarlo en vivo.",
    inputSchema: { id: z.string() },
  },
  tool(async (args) => {
    await postJson("/api/projects/open", { id: args.id });
    return ok(`Proyecto ${args.id} abierto.`);
  }),
);

server.registerTool(
  "delete_project",
  {
    title: "Eliminar proyecto",
    description: "Elimina un proyecto por id.",
    inputSchema: { id: z.string() },
  },
  tool(async (args) => {
    const res = await fetchRetry(`${getBase()}/api/projects?id=${encodeURIComponent(args.id)}`, { method: "DELETE", headers: authHeaders() });
    return ok(res.ok ? `Proyecto ${args.id} eliminado.` : `Error ${res.status}`);
  }),
);

server.registerTool(
  "set_resolution_preset",
  {
    title: "Preset de resolución",
    description:
      "Ajusta dimensiones y fps a un preset: youtube-1080p, youtube-1080p60, youtube-4k, shorts (vertical), square. reframe:true (por defecto) reencuadra los clips existentes al nuevo lienzo.",
    inputSchema: {
      preset: z.enum(["youtube-1080p", "youtube-1080p60", "youtube-4k", "shorts", "square"]),
      reframe: z.boolean().optional(),
    },
  },
  tool(async (args) => {
    const p = RES_PRESETS[args.preset];
    const doc = await getDoc();
    const cmds: Command[] = [{ type: "set_project_settings", patch: p }];
    if (args.reframe !== false && (doc.width !== p.width || doc.height !== p.height)) {
      cmds.push({ type: "reframe_clips", oldWidth: doc.width, oldHeight: doc.height, newWidth: p.width, newHeight: p.height, mode: "fit", scaleText: false });
    }
    await postCommands(cmds);
    return ok(`Resolución ${args.preset}: ${p.width}x${p.height} @${p.fps}fps.${args.reframe !== false ? " Clips reencuadrados." : ""}`);
  }),
);

server.registerTool(
  "reframe_clips",
  {
    title: "Reencuadrar clips al lienzo",
    description:
      "Reescala y reposiciona TODOS los clips para encajar en el lienzo actual tras un cambio de aspecto. mode: fit (cabe todo) | fill (cubre, puede recortar). Úsalo tras cambiar width/height si los clips quedaron fuera de cuadro.",
    inputSchema: {
      oldWidth: z.number().positive(),
      oldHeight: z.number().positive(),
      mode: z.enum(["fit", "fill"]).optional(),
      scaleText: z.boolean().optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    await postCommands([
      { type: "reframe_clips", oldWidth: args.oldWidth, oldHeight: args.oldHeight, newWidth: doc.width, newHeight: doc.height, mode: args.mode ?? "fit", scaleText: args.scaleText ?? false },
    ]);
    return ok(`Clips reencuadrados de ${args.oldWidth}x${args.oldHeight} a ${doc.width}x${doc.height} (${args.mode ?? "fit"}).`);
  }),
);

server.registerTool(
  "set_motion_blur",
  {
    title: "Motion blur",
    description:
      "Activa/desactiva el motion blur global (sub-muestreo de cámara). samples 1..30, shutterAngle 0..720. Cuesta render (es opt-in).",
    inputSchema: {
      enabled: z.boolean(),
      samples: z.number().min(1).max(30).optional(),
      shutterAngle: z.number().min(0).max(720).optional(),
    },
  },
  tool(async (args) => {
    const patch = args.enabled
      ? { motionBlur: { samples: args.samples ?? 10, shutterAngle: args.shutterAngle ?? 180 } }
      : { motionBlur: null };
    await postCommands([{ type: "set_project_settings", patch }]);
    return ok(`Motion blur ${args.enabled ? "activado" : "desactivado"}.`);
  }),
);

// ---- Consulta / inspección ------------------------------------------------

server.registerTool(
  "find_clips",
  {
    title: "Buscar clips",
    description:
      "Filtra clips del proyecto por tipo, pista, rango de frames (solapamiento) y/o texto contenido. Devuelve id/tipo/pista/start/duration.",
    inputSchema: {
      type: z.enum(CLIP_TYPES).optional(),
      trackId: z.string().optional(),
      fromFrame: z.number().optional(),
      toFrame: z.number().optional(),
      textContains: z.string().optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const out: Record<string, unknown>[] = [];
    for (const track of doc.tracks) {
      if (args.trackId && track.id !== args.trackId) continue;
      for (const clip of track.clips) {
        if (args.type && clip.type !== args.type) continue;
        if (args.fromFrame !== undefined || args.toFrame !== undefined) {
          const from = args.fromFrame ?? 0;
          const to = args.toFrame ?? Number.MAX_SAFE_INTEGER;
          if (!(clip.start < to && clip.start + clip.duration > from)) continue;
        }
        if (
          args.textContains &&
          !(typeof clip.text === "string" &&
            clip.text.toLowerCase().includes(args.textContains.toLowerCase()))
        )
          continue;
        out.push({
          id: clip.id,
          type: clip.type,
          name: clip.name,
          trackId: track.id,
          start: clip.start,
          duration: clip.duration,
          ...(typeof clip.text === "string" ? { text: clip.text } : {}),
        });
      }
    }
    return okJson({ count: out.length, clips: out });
  }),
);

server.registerTool(
  "get_clip",
  {
    title: "Obtener clip",
    description: "Devuelve el JSON completo de un clip por id (todas sus propiedades).",
    inputSchema: { clipId: z.string() },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    return okJson({ trackId: f.track.id, ...f.clip });
  }),
);

server.registerTool(
  "find_gaps",
  {
    title: "Huecos de una pista",
    description: "Devuelve los huecos (rangos vacíos) de una pista entre 0 y la duración del proyecto.",
    inputSchema: { trackId: z.string() },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const track = doc.tracks.find((t) => t.id === args.trackId);
    if (!track) return ok(`Pista ${args.trackId} no encontrada.`);
    const clips = [...track.clips].sort((a, b) => a.start - b.start);
    const gaps: { start: number; end: number; duration: number }[] = [];
    let cursor = 0;
    for (const c of clips) {
      if (c.start > cursor) gaps.push({ start: cursor, end: c.start, duration: c.start - cursor });
      cursor = Math.max(cursor, c.start + c.duration);
    }
    if (cursor < doc.durationInFrames)
      gaps.push({ start: cursor, end: doc.durationInFrames, duration: doc.durationInFrames - cursor });
    return okJson({ trackId: args.trackId, gaps });
  }),
);

// ---- Edición de alto nivel ------------------------------------------------

server.registerTool(
  "set_speed",
  {
    title: "Velocidad del clip",
    description:
      "Cambia la velocidad de un clip de video/audio (playbackRate) y ajusta su duración en la línea de tiempo. speed>1 acelera, <1 ralentiza. Por defecto desplaza (ripple) los clips POSTERIORES de la misma pista para que no se solapen; ripple:false los deja en su sitio.",
    inputSchema: { clipId: z.string(), speed: z.coerce.number().positive(), ripple: z.boolean().optional() },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    if (f.clip.type !== "video" && f.clip.type !== "audio") {
      return ok("set_speed solo aplica a clips de video o audio.");
    }
    // Compensa desde la velocidad ACTUAL (no asume 1x) para no acumular error
    // tras varios cambios: nueva = duración * (rateActual / rateNueva).
    const curRate = (f.clip.playbackRate as number) ?? 1;
    const oldDuration = f.clip.duration as number;
    const newDuration = Math.max(1, Math.round(oldDuration * (curRate / args.speed)));
    const delta = newDuration - oldDuration;
    const ripple = args.ripple !== false;
    const commands: Command[] = [
      { type: "update_clip", clipId: args.clipId, patch: { playbackRate: args.speed, duration: newDuration } },
    ];
    // Ripple: empuja los clips posteriores de la MISMA pista por el delta de
    // duración, evitando el solape con el clip ralentizado/acelerado.
    let moved = 0;
    if (ripple && delta !== 0) {
      const endFrame = (f.clip.start as number) + oldDuration;
      for (const c of f.track.clips) {
        if (c.id !== f.clip.id && (c.start as number) >= endFrame) {
          commands.push({ type: "move_clip", clipId: c.id as string, start: Math.max(0, (c.start as number) + delta) });
          moved++;
        }
      }
    }
    await postCommands(commands);
    return ok(
      `Velocidad de ${args.clipId} = ${args.speed}x (duración ${oldDuration}→${newDuration}f)` +
        (moved ? `; ${moved} clip(s) posterior(es) desplazado(s) ${delta > 0 ? "+" : ""}${delta}f.` : "."),
    );
  }),
);

function transitionPreset(type: string, dir?: string): string {
  switch (type) {
    case "crossfade":
    case "fade":
    case "fade-black":
      return "fade";
    case "slide":
      return `slide-${dir ?? "left"}`;
    case "wipe":
      return `wipe-${dir === "right" ? "right" : "left"}`;
    case "zoom":
      return "zoom-in";
    default:
      return "fade";
  }
}

server.registerTool(
  "add_transition",
  {
    title: "Transición",
    description:
      "Crea una transición REAL entre un clip y su anterior en la misma pista: los SOLAPA durante durationInFrames y cruza las animaciones (el anterior sale mientras este entra). type: crossfade|fade|fade-black|slide|wipe|zoom. Si no hay clip anterior, aplica solo la entrada. overlap=false para no solapar (solo animación de entrada).",
    inputSchema: {
      clipId: z.string(),
      type: z.enum(["crossfade", "fade", "fade-black", "slide", "wipe", "zoom"]),
      durationInFrames: z.number().optional(),
      direction: z.enum(["left", "right", "up", "down"]).optional(),
      overlap: z.boolean().optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    const preset = transitionPreset(args.type, args.direction);
    const dur = args.durationInFrames ?? 15;
    const anim = { preset, durationInFrames: dur, easing: "ease-in-out" };
    const B = f.clip;

    // Clip anterior en la misma pista (el de mayor start por debajo del de B).
    const prev = f.track.clips
      .filter((c) => c.id !== B.id && c.start <= B.start)
      .sort((a, b) => b.start - a.start)[0];

    const commands: Command[] = [];
    if (prev && args.overlap !== false) {
      const newStart = Math.max(0, prev.start + prev.duration - dur);
      commands.push({ type: "move_clip", clipId: B.id, start: newStart });
      commands.push({ type: "set_animation", clipId: prev.id, out: anim });
      commands.push({ type: "set_animation", clipId: B.id, in: anim });
      await postCommands(commands);
      return ok(`Transición '${args.type}' (${dur}f) entre ${prev.id} → ${B.id} con solape real.`);
    }
    await postCommands([{ type: "set_animation", clipId: B.id, in: anim }]);
    return ok(`Transición de entrada '${args.type}' (${dur}f) en ${B.id}.`);
  }),
);

const COLOR_MAP: Record<string, string> = {
  brightness: "brightness",
  contrast: "contrast",
  saturate: "saturate",
  saturation: "saturate", // alias: set_color_grade usa "saturation"; aquí lo aceptamos también
  grayscale: "grayscale",
  sepia: "sepia",
  hueRotate: "hue-rotate",
  invert: "invert",
};

server.registerTool(
  "color_grade",
  {
    title: "Corrección de color",
    description:
      "Ajusta el color de un clip (brillo, contraste, saturación, escala de grises, sepia, rotación de tono, invertir). Reemplaza solo los efectos de color indicados, conserva los demás.",
    inputSchema: {
      clipId: z.string(),
      brightness: z.coerce.number().optional(),
      contrast: z.coerce.number().optional(),
      saturate: z.coerce.number().optional(),
      saturation: z.coerce.number().optional(),
      grayscale: z.coerce.number().optional(),
      sepia: z.coerce.number().optional(),
      hueRotate: z.coerce.number().optional(),
      invert: z.coerce.number().optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    // Dedupe por tipo de efecto (saturate/saturation son alias → un solo efecto).
    const byType = new Map<string, number>();
    for (const [k, t] of Object.entries(COLOR_MAP)) {
      const v = (args as Record<string, unknown>)[k];
      if (typeof v === "number") byType.set(t, v);
    }
    const provided = [...byType].map(([type, value]) => ({ type, value }));
    if (provided.length === 0) return ok("Indica al menos un parámetro de color.");
    const providedTypes = new Set(provided.map((p) => p.type));
    const existing = (f.clip.effects ?? []).filter((e) => !providedTypes.has(e.type));
    const effects = [...existing, ...provided];
    await postCommands([{ type: "update_clip", clipId: args.clipId, patch: { effects } }]);
    return ok(`Color en ${args.clipId}: ${provided.map((p) => `${p.type}=${p.value}`).join(", ")}.`);
  }),
);

server.registerTool(
  "set_color_grade",
  {
    title: "Corrección de color (pro)",
    description:
      "Aplica corrección de color profesional (lift/gamma/gain + temperatura/tinte/exposición/contraste/saturación). Valores −100..100, 0 = neutro. Se fusiona con el grade existente del clip.",
    inputSchema: {
      clipId: z.string(),
      temperature: z.number().min(-100).max(100).optional(),
      tint: z.number().min(-100).max(100).optional(),
      exposure: z.number().min(-100).max(100).optional(),
      contrast: z.number().min(-100).max(100).optional(),
      saturation: z.number().min(-100).max(100).optional(),
      lift: z.number().min(-100).max(100).optional(),
      gamma: z.number().min(-100).max(100).optional(),
      gain: z.number().min(-100).max(100).optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    const cur = (f.clip.colorGrade as Record<string, number> | undefined) ?? {
      temperature: 0, tint: 0, exposure: 0, contrast: 0, saturation: 0, lift: 0, gamma: 0, gain: 0,
    };
    const keys = ["temperature", "tint", "exposure", "contrast", "saturation", "lift", "gamma", "gain"] as const;
    const grade: Record<string, number> = { ...cur };
    for (const k of keys) {
      const v = (args as Record<string, unknown>)[k];
      if (typeof v === "number") grade[k] = v;
    }
    await postCommands([{ type: "update_clip", clipId: args.clipId, patch: { colorGrade: grade } }]);
    return ok(`Color grade de ${args.clipId}: ${JSON.stringify(grade)}.`);
  }),
);

server.registerTool(
  "duck_audio",
  {
    title: "Ducking de audio",
    description:
      "Baja el volumen de un clip de audio/música durante un rango (frames absolutos) mediante keyframes, con rampa de entrada/salida. Ideal para voz sobre música.",
    inputSchema: {
      clipId: z.string(),
      fromFrame: z.number(),
      toFrame: z.number(),
      level: z.number().min(0).max(1).optional(),
      rampFrames: z.number().min(0).optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    const level = args.level ?? 0.2;
    const ramp = args.rampFrames ?? 8;
    const rel = (frame: number) => Math.max(0, Math.round(frame - f.clip.start));
    const points = [
      { frame: Math.max(0, rel(args.fromFrame) - ramp), value: 1 },
      { frame: rel(args.fromFrame), value: level },
      { frame: rel(args.toFrame), value: level },
      { frame: rel(args.toFrame) + ramp, value: 1 },
    ];
    // Dedupe por frame (si rampa y meseta colapsan al mismo frame, gana el último).
    const byFrame = new Map<number, number>();
    for (const p of points) byFrame.set(p.frame, p.value);
    const commands: Command[] = [...byFrame.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([frame, value]) => ({
        type: "add_keyframe",
        clipId: args.clipId,
        property: "volume",
        keyframe: { frame, value, easing: "ease-in-out" },
      }));
    await postCommands(commands);
    return ok(`Ducking en ${args.clipId}: volumen ${level} entre ${args.fromFrame}-${args.toFrame} (rampa ${ramp}f).`);
  }),
);

server.registerTool(
  "align_clip",
  {
    title: "Alinear clip",
    description:
      "Posiciona un clip respecto al lienzo. horizontal: left|center|right. vertical: top|center|bottom. margin en px desde el borde.",
    inputSchema: {
      clipId: z.string(),
      horizontal: z.enum(["left", "center", "right"]).optional(),
      vertical: z.enum(["top", "center", "bottom"]).optional(),
      margin: z.number().optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    const m = args.margin ?? 40;
    const patch: Record<string, number> = {};
    if (args.horizontal)
      patch.x = args.horizontal === "center" ? 0 : args.horizontal === "left" ? -(doc.width / 2) + m : doc.width / 2 - m;
    if (args.vertical)
      patch.y = args.vertical === "center" ? 0 : args.vertical === "top" ? -(doc.height / 2) + m : doc.height / 2 - m;
    if (Object.keys(patch).length === 0) return ok("Indica horizontal y/o vertical.");
    await postCommands([{ type: "update_clip", clipId: args.clipId, patch }]);
    return ok(`Clip ${args.clipId} alineado: ${JSON.stringify(patch)}.`);
  }),
);

// ---- Subtítulos -----------------------------------------------------------

function srtTimeToSec(t: string): number {
  // Acepta HH:MM:SS(.mmm) y MM:SS(.mmm) (WebVTT sin horas).
  const m = t.trim().replace(",", ".").match(/(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  const h = m[1] ? Number(m[1]) : 0;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(`0.${m[4]}`) : 0);
}
function parseSubtitles(text: string): { start: number; end: number; text: string }[] {
  const clean = text.replace(/\r/g, "");
  const blocks = clean.split(/\n\n+/);
  const cues: { start: number; end: number; text: string }[] = [];
  for (const b of blocks) {
    const lines = b.split("\n").filter((l) => l.trim() !== "" && l.trim().toUpperCase() !== "WEBVTT");
    const tl = lines.find((l) => l.includes("-->"));
    if (!tl) continue;
    const [a, bb] = tl.split("-->");
    const start = srtTimeToSec(a);
    const end = srtTimeToSec(bb);
    const txt = lines.slice(lines.indexOf(tl) + 1).join("\n").trim();
    if (txt) cues.push({ start, end, text: txt });
  }
  return cues;
}
// Sincronizado 1:1 con src/lib/captions.ts (incl. `y`) para que un mismo preset
// produzca el MISMO resultado por UI y por MCP. y = offset px desde el centro.
const CAPTION_PRESETS: Record<string, Record<string, unknown>> = {
  youtube: { fontFamily: "Inter", fontSize: 64, fontWeight: 700, color: "#ffffff", strokeColor: "#000000", strokeWidth: 6, shadowColor: "rgba(0,0,0,0.85)", shadowBlur: 8, textAlign: "center", y: 380 },
  tiktok: { fontFamily: "Inter", fontSize: 96, fontWeight: 800, color: "#ffffff", strokeColor: "#000000", strokeWidth: 10, shadowColor: "rgba(0,0,0,0.6)", shadowBlur: 24, textAlign: "center", y: 0 },
  minimal: { fontFamily: "Inter", fontSize: 56, fontWeight: 500, color: "#ffffff", strokeWidth: 0, shadowBlur: 0, textAlign: "center", y: 380 },
  bold: { fontFamily: "Inter", fontSize: 88, fontWeight: 900, color: "#ffe000", strokeColor: "#000000", strokeWidth: 8, shadowColor: "rgba(0,0,0,0.8)", shadowBlur: 10, textAlign: "center", y: 360 },
};

/** Palabra con timing en segundos (transcript word-level). */
type WordStampMcp = { text: string; start: number; end: number };
type WordCueMcp = { startSec: number; endSec: number; text: string; words: WordStampMcp[] };

/** Agrupa palabras planas en cues karaoke (greedy; mismos params que src/lib/captions). */
function groupWordsIntoCues(words: WordStampMcp[], vertical: boolean): WordCueMcp[] {
  const MAX_WORDS = vertical ? 4 : 7;
  const MAX_DUR = 2.5;
  const MAX_CHARS = vertical ? 22 : 42;
  const GAP_SPLIT = 0.6;
  const HARD = /[.?!…]$/;
  const SOFT = /[,;:]$/;
  const cues: WordCueMcp[] = [];
  let cur: WordStampMcp[] = [];
  let chars = 0;
  const flush = () => {
    if (!cur.length) return;
    cues.push({ startSec: cur[0].start, endSec: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" "), words: cur });
    cur = [];
    chars = 0;
  };
  for (const raw of words) {
    const w = { text: raw.text.trim(), start: raw.start, end: raw.end };
    if (!w.text) continue;
    const prev = cur[cur.length - 1];
    if (prev && (w.start - prev.end > GAP_SPLIT || HARD.test(prev.text))) flush();
    cur.push(w);
    chars += w.text.length + 1;
    if (cur.length >= MAX_WORDS || w.end - cur[0].start >= MAX_DUR || chars >= MAX_CHARS || SOFT.test(w.text)) flush();
  }
  flush();
  return cues;
}

server.registerTool(
  "add_subtitles",
  {
    title: "Añadir subtítulos",
    description:
      "Añade subtítulos como clips de texto. Pasa 'srt' (texto SRT/VTT) o 'cues' (start/end en segundos). preset: youtube|tiktok|minimal|bold. Crea una pista nueva si no das trackId.",
    inputSchema: {
      srt: z.string().optional(),
      cues: z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })).optional(),
      trackId: z.string().optional(),
      preset: z.enum(["youtube", "tiktok", "minimal", "bold"]).optional(),
      fontSize: z.number().optional(),
      y: z.number().optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const cues = args.srt ? parseSubtitles(args.srt) : (args.cues ?? []);
    if (cues.length === 0) return ok("No hay subtítulos: proporciona 'srt' o 'cues'.");
    const presetProps = CAPTION_PRESETS[args.preset ?? "youtube"];
    // Respeta la posición del preset (tiktok=centro y=0, youtube=abajo y=380…),
    // salvo que el llamador pase y explícito.
    const yPos = args.y !== undefined ? args.y : ((presetProps.y as number) ?? Math.round(doc.height / 2 - 140));
    const commands: Command[] = [];
    let trackId = args.trackId;
    if (!trackId) {
      const track = buildTrack({ name: "Subtítulos", kind: "media" });
      trackId = track.id as string;
      commands.push({ type: "add_track", track });
    }
    for (const cue of cues) {
      const start = Math.round(cue.start * doc.fps);
      const duration = Math.max(1, Math.round((cue.end - cue.start) * doc.fps));
      const clip = {
        type: "text",
        ...baseClip({ name: "Subtítulo", start, duration }),
        text: cue.text,
        fontFamily: "Inter",
        fontSize: 64,
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
        ...presetProps,
        ...(args.fontSize ? { fontSize: args.fontSize } : {}),
        y: yPos,
      };
      commands.push({ type: "add_clip", trackId, clip });
    }
    await postCommands(commands);
    return ok(`${cues.length} subtítulos añadidos a la pista ${trackId}.`);
  }),
);

// ---- Stock y generación ---------------------------------------------------

const BLEND_MODES = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light", "difference",
  "exclusion", "hue", "saturation", "color", "luminosity",
] as const;

server.registerTool(
  "search_stock",
  {
    title: "Buscar stock",
    description:
      "Busca medios de stock. type: image|video (Pexels/Pixabay) o audio (música en Jamendo / efectos SFX en Freesound, ambos Creative Commons). provider: pexels|pixabay|jamendo|freesound|all. Devuelve resultados con downloadUrl (úsalo en import_stock) y avisos si faltan API keys.",
    inputSchema: {
      query: z.string(),
      type: z.enum(["image", "video", "audio"]).optional(),
      provider: z.enum(["pexels", "pixabay", "jamendo", "freesound", "all"]).optional(),
    },
  },
  tool(async (args) => {
    const type = args.type ?? "video";
    const provider = args.provider ?? "all";
    const res = await getJson(
      `/api/stock/search?q=${encodeURIComponent(args.query)}&type=${type}&provider=${provider}`,
    );
    return okJson(res);
  }),
);

server.registerTool(
  "import_stock",
  {
    title: "Importar stock",
    description:
      "Descarga un asset de stock (por su downloadUrl) al proyecto y, si das trackId, lo añade a la línea de tiempo. kind: image|video|audio (audio = música/SFX; ponlo en una pista de audio). Para overlays VFX pasa blendMode (p. ej. 'screen').",
    inputSchema: {
      url: z.string(),
      kind: z.enum(["image", "video", "audio"]),
      name: z.string(),
      trackId: z.string().optional(),
      start: z.number().optional(),
      duration: z.number().optional(),
      durationSec: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      blendMode: z.enum(BLEND_MODES).optional(),
    },
  },
  tool(async (args) => {
    const asset = (await postJson("/api/stock/import", {
      url: args.url,
      kind: args.kind,
      name: args.name,
      durationSec: args.durationSec,
      width: args.width,
      height: args.height,
    })) as { id?: string; src?: string; durationInFrames?: number } | null;
    if (!asset?.src) return okJson(asset);
    let note = `Asset importado: ${asset.src}`;
    if (args.trackId) {
      const start = args.start ?? 0;
      // Duración real (del durationSec/asset) en vez del default de 90f (3s), que
      // recorta música/SFX largos. Prioridad: duration explícita → asset → 90.
      const duration = args.duration ?? asset.durationInFrames ?? 90;
      let clip: Record<string, unknown>;
      if (args.kind === "image")
        clip = { type: "image", ...baseClip({ name: args.name, start, duration, x: args.x, y: args.y }), src: asset.src, fit: "cover" };
      else if (args.kind === "audio")
        clip = { type: "audio", ...baseClip({ name: args.name, start, duration }), src: asset.src, trimStart: 0, volume: 1, playbackRate: 1, fadeInFrames: 0, fadeOutFrames: 0 };
      else
        clip = { type: "video", ...baseClip({ name: args.name, start, duration, x: args.x, y: args.y }), src: asset.src, trimStart: 0, volume: 1, muted: false, playbackRate: 1, fit: "cover", ...(args.blendMode ? { blendMode: args.blendMode } : {}) };
      await postCommands([{ type: "add_clip", trackId: args.trackId, clip }]);
      note += ` y añadido a ${args.trackId} (clipId=${clip.id as string}).`;
    }
    return ok(note);
  }),
);

server.registerTool(
  "add_generated_media",
  {
    title: "Añadir media generada",
    description:
      "Registra un asset generado por IA (imagen/video/audio por URL) y lo añade a la línea de tiempo en un solo paso. Úsalo tras generar con el MCP creativo.",
    inputSchema: {
      name: z.string(),
      kind: z.enum(["image", "video", "audio"]),
      src: z.string(),
      trackId: z.string(),
      start: z.number().optional(),
      duration: z.number().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
    },
  },
  tool(async (args) => {
    const asset = { id: newId("asset"), name: args.name, kind: args.kind, src: args.src };
    await postJson("/api/assets", { asset });
    const start = args.start ?? 0;
    const duration = args.duration ?? 90;
    let clip: Record<string, unknown>;
    if (args.kind === "image")
      clip = { type: "image", ...baseClip({ name: args.name, start, duration, x: args.x, y: args.y }), src: args.src, fit: "cover" };
    else if (args.kind === "video")
      clip = { type: "video", ...baseClip({ name: args.name, start, duration, x: args.x, y: args.y }), src: args.src, trimStart: 0, volume: 1, muted: false, playbackRate: 1, fit: "cover" };
    else
      clip = { type: "audio", ...baseClip({ name: args.name, start, duration }), src: args.src, trimStart: 0, volume: 1, playbackRate: 1, fadeInFrames: 0, fadeOutFrames: 0 };
    await postCommands([{ type: "add_clip", trackId: args.trackId, clip }]);
    return ok(`Media generada añadida a ${args.trackId} (clipId=${clip.id as string}).`);
  }),
);

// ---- Audio ----------------------------------------------------------------

server.registerTool(
  "normalize_audio",
  {
    title: "Normalizar audio (loudness)",
    description:
      "Normaliza el loudness a estándar YouTube (-14 LUFS) generando un audio nuevo. Pasa clipId (reemplaza su src) o src directo. Local con ffmpeg.",
    inputSchema: {
      clipId: z.string().optional(),
      src: z.string().optional(),
      i: z.number().optional(),
      tp: z.number().optional(),
      lra: z.number().optional(),
    },
  },
  tool(async (args) => {
    let src = args.src;
    if (args.clipId && !src) {
      const doc = await getDoc();
      const f = locateClip(doc, args.clipId);
      if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
      src = f.clip.src as string | undefined;
    }
    if (!src) return ok("Indica 'clipId' (de audio/video) o 'src'.");
    const asset = (await postJson("/api/normalize", { src, i: args.i, tp: args.tp, lra: args.lra })) as {
      src?: string;
    } | null;
    if (!asset?.src) return okJson(asset);
    if (args.clipId) {
      await postCommands([{ type: "update_clip", clipId: args.clipId, patch: { src: asset.src } }]);
      return ok(`Audio de ${args.clipId} normalizado → ${asset.src}.`);
    }
    return ok(`Audio normalizado: ${asset.src}`);
  }),
);

server.registerTool(
  "set_audio_fades",
  {
    title: "Fades de audio",
    description: "Aplica fade-in/out (en frames) a un clip de audio o video.",
    inputSchema: {
      clipId: z.string(),
      fadeInFrames: z.number().min(0).optional(),
      fadeOutFrames: z.number().min(0).optional(),
    },
  },
  tool(async (args) => {
    const patch: Record<string, number> = {};
    if (args.fadeInFrames !== undefined) patch.fadeInFrames = args.fadeInFrames;
    if (args.fadeOutFrames !== undefined) patch.fadeOutFrames = args.fadeOutFrames;
    if (Object.keys(patch).length === 0) return ok("Indica fadeInFrames y/o fadeOutFrames.");
    await postCommands([{ type: "update_clip", clipId: args.clipId, patch }]);
    return ok(`Fades de ${args.clipId}: ${JSON.stringify(patch)}.`);
  }),
);

// ---- VFX pro (procesado local con ffmpeg) ---------------------------------

async function runVfx(args: {
  clipId?: string;
  src?: string;
  op: string;
  params?: Record<string, unknown>;
}): Promise<ToolResult> {
  let src = args.src;
  if (args.clipId && !src) {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    src = f.clip.src as string | undefined;
  }
  if (!src) return ok("Indica 'clipId' (de video) o 'src'.");
  const asset = (await postJson("/api/vfx", { src, op: args.op, params: args.params ?? {} })) as {
    src?: string;
  } | null;
  if (!asset?.src) return okJson(asset);
  if (args.clipId) {
    await postCommands([{ type: "update_clip", clipId: args.clipId, patch: { src: asset.src } }]);
    return ok(`'${args.op}' aplicado a ${args.clipId} → ${asset.src}.`);
  }
  return ok(`'${args.op}': ${asset.src}`);
}

server.registerTool(
  "stabilize_video",
  {
    title: "Estabilizar video",
    description:
      "Estabiliza un video tembloroso (vidstab, 2 pasadas, local). shakiness 1..10, smoothing 0..100. Reemplaza el src del clip si das clipId. Puede tardar (re-encode).",
    inputSchema: {
      clipId: z.string().optional(),
      src: z.string().optional(),
      shakiness: z.number().min(1).max(10).optional(),
      smoothing: z.number().min(0).max(100).optional(),
    },
  },
  tool((args) =>
    runVfx({ clipId: args.clipId, src: args.src, op: "stabilize", params: { shakiness: args.shakiness, smoothing: args.smoothing } }),
  ),
);

server.registerTool(
  "apply_lut",
  {
    title: "Aplicar LUT (.cube)",
    description:
      "Aplica un LUT 3D (.cube) a un video (lut3d, local). lutPath = ruta del .cube en el disco del usuario. Reemplaza el src del clip si das clipId.",
    inputSchema: { clipId: z.string().optional(), src: z.string().optional(), lutPath: z.string() },
  },
  tool((args) => runVfx({ clipId: args.clipId, src: args.src, op: "lut", params: { lutPath: args.lutPath } })),
);

server.registerTool(
  "denoise_video",
  {
    title: "Reducir ruido",
    description: "Reduce el ruido de un video (hqdn3d, local). strength 0..10.",
    inputSchema: { clipId: z.string().optional(), src: z.string().optional(), strength: z.number().min(0).max(10).optional() },
  },
  tool((args) => runVfx({ clipId: args.clipId, src: args.src, op: "denoise", params: { strength: args.strength } })),
);

server.registerTool(
  "sharpen_video",
  {
    title: "Enfocar video",
    description: "Aumenta la nitidez de un video (unsharp, local). amount 0..3.",
    inputSchema: { clipId: z.string().optional(), src: z.string().optional(), amount: z.number().min(0).max(3).optional() },
  },
  tool((args) => runVfx({ clipId: args.clipId, src: args.src, op: "sharpen", params: { amount: args.amount } })),
);

// ---- Compositing ----------------------------------------------------------

server.registerTool(
  "set_blend_mode",
  {
    title: "Modo de fusión",
    description: "Aplica un modo de fusión (mix-blend-mode CSS) al clip respecto a las capas inferiores.",
    inputSchema: { clipId: z.string(), mode: z.enum(BLEND_MODES) },
  },
  tool(async (args) => {
    await postCommands([{ type: "update_clip", clipId: args.clipId, patch: { blendMode: args.mode } }]);
    return ok(`Modo de fusión de ${args.clipId} = ${args.mode}.`);
  }),
);

server.registerTool(
  "set_crop",
  {
    title: "Recortar clip",
    description: "Recorta el clip por lados (porcentaje 0..100 de cada borde).",
    inputSchema: {
      clipId: z.string(),
      top: z.number().min(0).max(100).optional(),
      right: z.number().min(0).max(100).optional(),
      bottom: z.number().min(0).max(100).optional(),
      left: z.number().min(0).max(100).optional(),
    },
  },
  tool(async (args) => {
    const crop = {
      top: args.top ?? 0,
      right: args.right ?? 0,
      bottom: args.bottom ?? 0,
      left: args.left ?? 0,
    };
    await postCommands([{ type: "update_clip", clipId: args.clipId, patch: { crop } }]);
    return ok(`Recorte de ${args.clipId}: ${JSON.stringify(crop)}.`);
  }),
);

server.registerTool(
  "set_mask",
  {
    title: "Máscara de forma",
    description: "Aplica una máscara de forma al clip: none, circle, ellipse o rounded.",
    inputSchema: { clipId: z.string(), mask: z.enum(["none", "circle", "ellipse", "rounded"]) },
  },
  tool(async (args) => {
    await postCommands([{ type: "update_clip", clipId: args.clipId, patch: { mask: args.mask } }]);
    return ok(`Máscara de ${args.clipId} = ${args.mask}.`);
  }),
);

server.registerTool(
  "make_pip",
  {
    title: "Picture-in-picture",
    description:
      "Convierte un clip en picture-in-picture: lo escala y lo coloca en una esquina. corner: top-left|top-right|bottom-left|bottom-right.",
    inputSchema: {
      clipId: z.string(),
      corner: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
      scale: z.number().min(0.05).max(1).optional(),
      margin: z.number().min(0).optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const s = args.scale ?? 0.3;
    const m = args.margin ?? 40;
    const halfW = (doc.width * (1 - s)) / 2 - m;
    const halfH = (doc.height * (1 - s)) / 2 - m;
    const x = args.corner.includes("left") ? -halfW : halfW;
    const y = args.corner.includes("top") ? -halfH : halfH;
    await postCommands([{ type: "update_clip", clipId: args.clipId, patch: { scale: s, x, y } }]);
    return ok(`PiP de ${args.clipId} en ${args.corner} (escala ${s}).`);
  }),
);

server.registerTool(
  "chroma_key",
  {
    title: "Chroma key (pantalla verde)",
    description:
      "Quita el fondo de color de un video generando un WebM con canal alfa. Pasa clipId (procesa su src y lo reemplaza) o src directo. color por defecto verde (0x00FF00). Puede tardar (re-encode).",
    inputSchema: {
      clipId: z.string().optional(),
      src: z.string().optional(),
      color: z.string().optional(),
      similarity: z.number().min(0.01).max(1).optional(),
      blend: z.number().min(0).max(1).optional(),
      trackId: z.string().optional(),
      start: z.number().optional(),
      duration: z.number().optional(),
    },
  },
  tool(async (args) => {
    let src = args.src;
    if (args.clipId && !src) {
      const doc = await getDoc();
      const f = locateClip(doc, args.clipId);
      if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
      src = f.clip.src as string | undefined;
    }
    if (!src) return ok("Indica 'clipId' (de un video) o 'src'.");
    const asset = (await postJson("/api/chromakey", {
      src,
      color: args.color,
      similarity: args.similarity,
      blend: args.blend,
    })) as { id?: string; src?: string } | null;
    if (!asset?.src) return okJson(asset);

    if (args.clipId) {
      await postCommands([{ type: "update_clip", clipId: args.clipId, patch: { src: asset.src } }]);
      return ok(`Fondo eliminado de ${args.clipId} → ${asset.src} (video con alfa).`);
    }
    if (args.trackId) {
      const clip = {
        type: "video",
        ...baseClip({ name: "Chroma", start: args.start ?? 0, duration: args.duration ?? 90 }),
        src: asset.src,
        trimStart: 0,
        volume: 1,
        muted: false,
        playbackRate: 1,
        fit: "contain",
      };
      await postCommands([{ type: "add_clip", trackId: args.trackId, clip }]);
      return ok(`Video con alfa añadido a ${args.trackId} (clipId=${clip.id as string}).`);
    }
    return ok(`Video con alfa generado: ${asset.src}`);
  }),
);

// ---- Edición fina: ripple y marcadores ------------------------------------

server.registerTool(
  "ripple_delete",
  {
    title: "Ripple delete",
    description:
      "Elimina un clip y desplaza a la izquierda los clips posteriores de su pista para cerrar el hueco.",
    inputSchema: { clipId: z.string() },
  },
  tool(async (args) => {
    await postCommands([{ type: "ripple_delete", clipId: args.clipId }]);
    return ok(`Clip ${args.clipId} eliminado con ripple (hueco cerrado).`);
  }),
);

server.registerTool(
  "add_marker",
  {
    title: "Añadir marcador",
    description: "Añade un marcador/capítulo en un frame absoluto. Devuelve su id.",
    inputSchema: {
      frame: z.number().min(0),
      label: z.string().optional(),
      color: z.string().optional(),
    },
  },
  tool(async (args) => {
    const id = newId("mk");
    await postCommands([
      {
        type: "add_marker",
        marker: { id, frame: args.frame, label: args.label ?? "", color: args.color ?? "#f59e0b" },
      },
    ]);
    return ok(`Marcador añadido en frame ${args.frame}. id=${id}`);
  }),
);

server.registerTool(
  "remove_marker",
  {
    title: "Eliminar marcador",
    description: "Elimina un marcador por id.",
    inputSchema: { markerId: z.string() },
  },
  tool(async (args) => {
    await postCommands([{ type: "remove_marker", markerId: args.markerId }]);
    return ok(`Marcador ${args.markerId} eliminado.`);
  }),
);

server.registerTool(
  "list_markers",
  {
    title: "Listar marcadores",
    description: "Lista los marcadores/capítulos del proyecto actual.",
    inputSchema: {},
  },
  tool(async () => {
    const doc = (await getJson("/api/document")) as { markers?: unknown[] };
    return okJson(doc.markers ?? []);
  }),
);

server.registerTool(
  "update_marker",
  {
    title: "Actualizar marcador/nota",
    description:
      "Actualiza campos de un marcador o nota por id (frame, label, color, kind, note, status, frameEnd). Solo se cambian los campos que envíes.",
    inputSchema: {
      markerId: z.string(),
      frame: z.number().min(0).optional(),
      label: z.string().optional(),
      color: z.string().optional(),
      kind: z.enum(["chapter", "note"]).optional(),
      note: z.string().optional(),
      status: z.enum(["pending", "applied", "dismissed"]).optional(),
      frameEnd: z.number().min(0).optional(),
    },
  },
  tool(async (args) => {
    const { markerId, ...rest } = args;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
    if (Object.keys(patch).length === 0) return ok("Nada que actualizar.");
    await postCommands([{ type: "update_marker", markerId, patch }]);
    return ok(`Marcador ${markerId} actualizado.`);
  }),
);

// ---- Notas de edición (anotar → revisar → aplicar) ------------------------

server.registerTool(
  "add_note",
  {
    title: "Añadir nota de edición",
    description:
      "Añade una nota de edición anclada a un frame (queda 'pending'). Úsala para registrar TODO lo que el dueño pide antes de aplicarlo, o para dejar recordatorios. Es un marcador kind='note'.",
    inputSchema: {
      frame: z.number().min(0),
      note: z.string(),
      frameEnd: z.number().min(0).optional(),
      color: z.string().optional(),
    },
  },
  tool(async (args) => {
    const id = newId("note");
    await postCommands([
      {
        type: "add_marker",
        marker: {
          id,
          frame: args.frame,
          label: "",
          color: args.color ?? "#38bdf8",
          kind: "note",
          note: args.note,
          status: "pending",
          source: "text",
          ...(args.frameEnd != null ? { frameEnd: args.frameEnd } : {}),
        },
      },
    ]);
    return ok(`Nota añadida en frame ${args.frame}. id=${id}`);
  }),
);

server.registerTool(
  "list_notes",
  {
    title: "Listar notas de edición",
    description:
      "Lista las notas que el dueño dejó mientras veía el vídeo (las pendientes por defecto). Cada nota trae su frame, su tiempo en segundos y los CLIPS que solapan ese frame, para resolver referencias como 'aquí'/'esto'/'esta parte'. Flujo: lee las notas → aplica cada una con las tools del editor → márcala con resolve_note(applied).",
    inputSchema: {
      status: z.enum(["pending", "applied", "dismissed", "all"]).optional(),
    },
  },
  tool(async (args) => {
    const doc = (await getJson("/api/document")) as {
      fps?: number;
      markers?: {
        id: string;
        frame: number;
        kind?: string;
        note?: string;
        status?: string;
        source?: string;
        frameEnd?: number;
      }[];
      tracks?: {
        id: string;
        name?: string;
        clips?: { id: string; type: string; name?: string; start: number; duration: number }[];
      }[];
    };
    const fps = doc.fps ?? 30;
    const want = args.status ?? "pending";
    const clipsAt = (frame: number) => {
      const out: { id: string; type: string; name?: string; track?: string; start: number; end: number }[] = [];
      for (const t of doc.tracks ?? [])
        for (const c of t.clips ?? [])
          if (frame >= c.start && frame < c.start + c.duration)
            out.push({ id: c.id, type: c.type, name: c.name, track: t.name, start: c.start, end: c.start + c.duration });
      return out;
    };
    const notes = (doc.markers ?? [])
      .filter((m) => m.kind === "note" && (want === "all" || (m.status ?? "pending") === want))
      .sort((a, b) => a.frame - b.frame)
      .map((m) => ({
        id: m.id,
        frame: m.frame,
        frameEnd: m.frameEnd,
        timeSec: Number((m.frame / fps).toFixed(2)),
        note: m.note ?? "",
        status: m.status ?? "pending",
        source: m.source ?? "text",
        clipsAtFrame: clipsAt(m.frame),
      }));
    return okJson({ fps, count: notes.length, notes });
  }),
);

server.registerTool(
  "resolve_note",
  {
    title: "Resolver nota",
    description:
      "Marca una nota como 'applied' (ya la ejecutaste), 'dismissed' (la ignoras) o 'pending' (reabrir). Llama esto DESPUÉS de aplicar cada nota para no repetirla.",
    inputSchema: {
      noteId: z.string(),
      status: z.enum(["applied", "dismissed", "pending"]),
    },
  },
  tool(async (args) => {
    await postCommands([
      { type: "update_marker", markerId: args.noteId, patch: { status: args.status } },
    ]);
    return ok(`Nota ${args.noteId} → ${args.status}.`);
  }),
);

// ---- Looks de color (LUTs "incluidos" sin .cube) --------------------------

const COLOR_LOOKS: Record<string, Record<string, number>> = {
  "teal-orange": { temperature: 15, tint: -5, contrast: 20, saturation: 15, gain: 8, lift: -5 },
  vintage: { temperature: 20, saturation: -20, contrast: -10, gain: -8, lift: 12 },
  noir: { saturation: -100, contrast: 35 },
  warm: { temperature: 30, exposure: 5 },
  cool: { temperature: -30, tint: 5, contrast: 8 },
  bleach: { saturation: -40, contrast: 30, exposure: 8 },
  "cine-green": { tint: -15, temperature: -8, contrast: 15, gain: 5 },
};

server.registerTool(
  "apply_look",
  {
    title: "Aplicar look de color",
    description:
      "Aplica un 'look' cinematográfico predefinido (color grade) a un clip, sin archivos .cube. Looks: teal-orange, vintage, noir, warm, cool, bleach, cine-green. Se fusiona con el grade existente.",
    inputSchema: {
      clipId: z.string(),
      look: z.enum(["teal-orange", "vintage", "noir", "warm", "cool", "bleach", "cine-green"]),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    const existing = (f.clip.colorGrade as Record<string, number> | undefined) ?? {};
    const colorGrade = { ...existing, ...COLOR_LOOKS[args.look] };
    await postCommands([{ type: "update_clip", clipId: args.clipId, patch: { colorGrade } }]);
    return ok(`Look '${args.look}' aplicado a ${args.clipId}.`);
  }),
);

// ---- Audio: limpiar voz, medir loudness -----------------------------------

server.registerTool(
  "clean_audio",
  {
    title: "Limpiar audio (denoise / de-esser)",
    description:
      "Limpia la voz con ffmpeg local: reducción de ruido FFT (afftdn), highpass (quita zumbido), de-esser opcional. Genera un asset de audio nuevo. Si pasas clipId, reemplaza el src del clip por el limpio.",
    inputSchema: {
      src: z.string().optional(),
      clipId: z.string().optional(),
      denoise: z.boolean().optional(),
      highpass: z.number().optional(),
      lowpass: z.number().optional(),
      deEss: z.boolean().optional(),
    },
  },
  tool(async (args) => {
    let src = args.src;
    if (!src && args.clipId) {
      const doc = await getDoc();
      const f = locateClip(doc, args.clipId);
      if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
      src = f.clip.src as string;
    }
    if (!src) return fail("Indica src o clipId.");
    const res = (await postJson("/api/audiofx", {
      src,
      denoise: args.denoise,
      highpass: args.highpass,
      lowpass: args.lowpass,
      deEss: args.deEss,
    })) as { id: string; src: string };
    if (args.clipId) {
      await postCommands([{ type: "update_clip", clipId: args.clipId, patch: { src: res.src } }]);
      return ok(`Audio limpiado → ${res.src} y aplicado a ${args.clipId}.`);
    }
    return okJson(res);
  }),
);

server.registerTool(
  "measure_loudness",
  {
    title: "Medir loudness (LUFS)",
    description:
      "Mide el loudness integrado real (ebur128): LUFS integrado, true peak, LRA y la diferencia respecto al objetivo de YouTube (−14 LUFS). Pasa src o clipId.",
    inputSchema: { src: z.string().optional(), clipId: z.string().optional() },
  },
  tool(async (args) => {
    let src = args.src;
    if (!src && args.clipId) {
      const doc = await getDoc();
      const f = locateClip(doc, args.clipId);
      if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
      src = f.clip.src as string;
    }
    if (!src) return fail("Indica src o clipId.");
    return okJson(await postJson("/api/loudness", { src }));
  }),
);

// ---- Silencios: detectar + auto-corte (jump-cut) --------------------------

server.registerTool(
  "detect_silences",
  {
    title: "Detectar silencios",
    description:
      "Detecta los rangos de silencio (en segundos) de un audio/video con ffmpeg. Útil para decidir cortes. noiseDb = umbral (−30 por defecto), minDurSec = silencio mínimo.",
    inputSchema: {
      src: z.string().optional(),
      clipId: z.string().optional(),
      noiseDb: z.number().optional(),
      minDurSec: z.number().optional(),
    },
  },
  tool(async (args) => {
    let src = args.src;
    if (!src && args.clipId) {
      const doc = await getDoc();
      const f = locateClip(doc, args.clipId);
      if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
      src = f.clip.src as string;
    }
    if (!src) return fail("Indica src o clipId.");
    return okJson(await postJson("/api/silences", { src, noiseDb: args.noiseDb, minDurSec: args.minDurSec }));
  }),
);

server.registerTool(
  "auto_cut_silences",
  {
    title: "Auto-cortar silencios (jump-cut)",
    description:
      "Detecta los silencios de un clip de video/audio y los ELIMINA con ripple (jump-cut), cerrando los huecos. Deja un padding alrededor del habla. Es el corte que más tiempo ahorra editando un YouTube hablado.",
    inputSchema: {
      clipId: z.string(),
      noiseDb: z.number().optional(),
      minSilenceSec: z.number().optional(),
      paddingMs: z.number().optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    const clip = f.clip;
    const src = clip.src as string | undefined;
    if (!src) return fail("El clip no tiene src.");
    const fps = doc.fps;
    const start = clip.start as number;
    const duration = clip.duration as number;
    const trim = (clip.trimStart as number) ?? 0;
    const rate = (clip.playbackRate as number) ?? 1; // tiempo de fuente → timeline
    const minSil = args.minSilenceSec ?? 0.4; // alineado con el default de detect_silences (silences.ts)
    const padF = Math.round(((args.paddingMs ?? 120) / 1000) * fps);
    const minCut = Math.max(2, Math.round(0.15 * fps));

    const { silences } = (await postJson("/api/silences", {
      src,
      noiseDb: args.noiseDb,
      minDurSec: minSil,
    })) as { silences: { start: number; end: number }[] };

    // Frame de timeline = start + (frameFuente - trim) / playbackRate.
    const toTimeline = (sec: number) => start + (sec * fps - trim) / rate;
    const ranges = silences
      .map((s) => ({
        fs: Math.round(toTimeline(s.start)) + padF,
        fe: Math.round(toTimeline(s.end)) - padF,
      }))
      .map((r) => ({
        fs: Math.max(start + 1, r.fs),
        fe: Math.min(start + duration - 1, r.fe),
      }))
      .filter((r) => r.fe - r.fs >= minCut)
      .sort((a, b) => b.fs - a.fs); // derecha → izquierda (ids/posiciones estables)

    if (ranges.length === 0) return ok("No se encontraron silencios que recortar.");

    const commands: Command[] = [];
    let removed = 0;
    for (const r of ranges) {
      const idB = newId("clip");
      const idA = newId("clip");
      commands.push({ type: "split_clip", clipId: args.clipId, frame: r.fe, newId: idB });
      commands.push({ type: "split_clip", clipId: args.clipId, frame: r.fs, newId: idA });
      commands.push({ type: "ripple_delete", clipId: idA });
      removed += r.fe - r.fs;
    }
    await postCommands(commands);
    return ok(
      `Recortados ${ranges.length} silencios (${removed} frames ≈ ${(removed / fps).toFixed(1)}s) de ${args.clipId}.`,
    );
  }),
);

// Muletillas por idioma. Conservadoras por defecto; las ambiguas (like, so, bueno…)
// se añaden con extraWords. Whole-token match (nunca substring).
// Conservadoras por defecto (interjecciones puras, casi nunca legítimas). Las
// léxicas ambiguas (este, pues, o sea, like, you know) se añaden con extraWords.
const FILLER_WORDS: Record<string, string[]> = {
  es: ["eh", "em", "mmm", "ah"],
  en: ["um", "uh", "uhm", "er", "mm", "hmm"],
};
const normFiller = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

server.registerTool(
  "remove_fillers",
  {
    title: "Quitar muletillas",
    description:
      "Transcribe el clip a nivel palabra (local) y ELIMINA muletillas con ripple. Por defecto solo interjecciones puras (um, uh, eh, em…). Las léxicas ambiguas (este, o sea, pues, like, you know) NO van por defecto — añádelas con extraWords. language es/en (auto si se omite). ignoreWords excluye. dryRun:true devuelve las detecciones SIN cortar (RECOMENDADO la primera vez). OJO: solo riplea la pista del clip — quita muletillas ANTES de subtitular.",
    inputSchema: {
      clipId: z.string(),
      language: z.string().optional(),
      extraWords: z.array(z.string()).optional(),
      ignoreWords: z.array(z.string()).optional(),
      paddingMs: z.number().optional(),
      dryRun: z.boolean().optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    const clip = f.clip;
    const src = clip.src as string | undefined;
    if (!src) return fail("El clip no tiene src.");
    const fps = doc.fps;
    const start = clip.start as number;
    const duration = clip.duration as number;
    const trim = (clip.trimStart as number) ?? 0;
    const rate = (clip.playbackRate as number) ?? 1;

    // Transcripción a nivel palabra (reusa el flujo de auto_caption animated).
    const wr = (await postJson("/api/transcribe", { src, language: args.language, words: true })) as {
      status?: string; words?: { words: WordStampMcp[]; language?: string }; jobId?: string;
      detection?: { top: { language: string; prob: number }[] };
    };
    if (wr.status === "needs_language" && wr.detection) {
      const opts = wr.detection.top.map((t) => `${t.language} ${(t.prob * 100).toFixed(0)}%`).join(", ");
      return ok(`IDIOMA INCIERTO. Candidatos: ${opts}. Vuelve a llamar con language="<código>".`);
    }
    let wordData = wr.words;
    if (!wordData && wr.jobId) {
      const t0 = Date.now();
      while (Date.now() - t0 < 900000) {
        await sleep(3000);
        const s = (await getJson(`/api/transcribe?id=${wr.jobId}`)) as { status: string; words?: { words: WordStampMcp[]; language?: string } };
        if (s.status === "done" && s.words) { wordData = s.words; break; }
        if (s.status === "error") return fail("Error transcribiendo (palabras).");
      }
    }
    if (!wordData) return ok("Transcripción por palabra no disponible (reintenta).");

    const lang = (args.language || wordData.language || "es").slice(0, 2).toLowerCase();
    const ignore = new Set((args.ignoreWords ?? []).map(normFiller));
    const fillers = [...(FILLER_WORDS[lang] ?? FILLER_WORDS.es), ...(args.extraWords ?? [])]
      .map(normFiller).filter((w) => w && !ignore.has(w));
    const unigrams = new Set(fillers.filter((w) => !w.includes(" ")));
    const ngrams = fillers.filter((w) => w.includes(" ")).map((w) => w.split(" "));
    const maxN = ngrams.reduce((m, g) => Math.max(m, g.length), 1);

    // Normaliza cada palabra a su(s) token(s); ignora palabras vacías tras normalizar.
    const words = wordData.words
      .map((w) => ({ ...w, tok: normFiller(w.text) }))
      .filter((w) => w.tok.length > 0);

    const padF = Math.round(((args.paddingMs ?? 0) / 1000) * fps);
    const toTimeline = (sec: number) => start + (sec * fps - trim) / rate;
    type Hit = { text: string; s: number; e: number };
    const hits: Hit[] = [];
    for (let i = 0; i < words.length; ) {
      let matched = 0;
      // n-gramas primero (greedy, el más largo).
      for (let n = Math.min(maxN, words.length - i); n >= 2 && !matched; n--) {
        const phrase = words.slice(i, i + n).map((w) => w.tok).join(" ");
        if (ngrams.some((g) => g.join(" ") === phrase)) matched = n;
      }
      if (!matched && unigrams.has(words[i].tok)) matched = 1;
      if (matched) {
        hits.push({ text: words.slice(i, i + matched).map((w) => w.text.trim()).join(" "), s: words[i].start, e: words[i + matched - 1].end });
        i += matched;
      } else i += 1;
    }

    // Mapeo a frames de timeline (envuelve la muletilla con padding).
    const minCut = Math.max(1, Math.round(0.05 * fps));
    const gapF = Math.round(0.08 * fps);
    let ranges = hits
      .map((h) => ({ text: h.text, fs: Math.floor(toTimeline(h.s)) - padF, fe: Math.ceil(toTimeline(h.e)) + padF }))
      .map((r) => ({ text: r.text, fs: Math.max(start + 1, r.fs), fe: Math.min(start + duration - 1, r.fe) }))
      .filter((r) => r.fe - r.fs >= minCut)
      .sort((a, b) => a.fs - b.fs);
    // Fusiona cortes adyacentes (muletillas con micro-pausa).
    const merged: typeof ranges = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r.fs - last.fe <= gapF) { last.fe = Math.max(last.fe, r.fe); last.text += " " + r.text; }
      else merged.push({ ...r });
    }
    ranges = merged;

    if (ranges.length === 0) return ok("No se detectaron muletillas en el clip.");
    const totalFrames = ranges.reduce((n, r) => n + (r.fe - r.fs), 0);
    const summary = ranges.map((r) => `"${r.text.trim()}" @${(((r.fs - start) * rate + trim) / fps).toFixed(1)}s`).join(", ");

    if (args.dryRun) {
      return ok(`[dryRun] ${ranges.length} muletillas (${totalFrames} frames ≈ ${(totalFrames / fps).toFixed(1)}s): ${summary}. Vuelve a llamar sin dryRun para cortarlas.`);
    }

    const commands: Command[] = [];
    for (const r of [...ranges].sort((a, b) => b.fs - a.fs)) { // derecha → izquierda
      const idB = newId("clip");
      const idA = newId("clip");
      commands.push({ type: "split_clip", clipId: args.clipId, frame: r.fe, newId: idB });
      commands.push({ type: "split_clip", clipId: args.clipId, frame: r.fs, newId: idA });
      commands.push({ type: "ripple_delete", clipId: idA });
    }
    await postCommands(commands);
    return ok(`Quitadas ${ranges.length} muletillas (${totalFrames} frames ≈ ${(totalFrames / fps).toFixed(1)}s) de ${args.clipId}: ${summary}.`);
  }),
);

server.registerTool(
  "auto_duck",
  {
    title: "Auto-ducking guiado por voz",
    description:
      "Baja la música automáticamente SOLO cuando hay voz. Detecta las ventanas de habla en el clip de voz (complemento de los silencios) y aplica keyframes de ducking sobre el clip de música.",
    inputSchema: {
      musicClipId: z.string(),
      voiceClipId: z.string(),
      level: z.number().min(0).max(1).optional(),
      rampFrames: z.number().min(0).optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const music = locateClip(doc, args.musicClipId);
    const voice = locateClip(doc, args.voiceClipId);
    if (!music || !voice) return ok("Clip de música o voz no encontrado.");
    const fps = doc.fps;
    const vSrc = voice.clip.src as string | undefined;
    if (!vSrc) return fail("El clip de voz no tiene src.");
    const level = args.level ?? 0.2;
    const ramp = args.rampFrames ?? 8;

    const vStart = voice.clip.start as number;
    const vDur = voice.clip.duration as number;
    const vTrim = (voice.clip.trimStart as number) ?? 0;
    const vRate = (voice.clip.playbackRate as number) ?? 1;
    const mDur = music.clip.duration as number;
    const { silences } = (await postJson("/api/silences", { src: vSrc, minDurSec: 0.4 })) as {
      silences: { start: number; end: number }[];
    };

    // Ventanas de VOZ = complemento de los silencios dentro del clip de voz.
    // El clip muestra source [vTrim, vTrim + vDur*vRate] (en frames de fuente).
    const winStartSec = vTrim / fps;
    const winEndSec = (vTrim + vDur * vRate) / fps;
    const voiceWindows: { from: number; to: number }[] = [];
    let cursor = winStartSec;
    for (const s of silences.sort((a, b) => a.start - b.start)) {
      if (s.start > cursor) voiceWindows.push({ from: cursor, to: Math.min(s.start, winEndSec) });
      cursor = Math.max(cursor, s.end);
    }
    if (cursor < winEndSec) voiceWindows.push({ from: cursor, to: winEndSec });

    // A frames de timeline relativos al clip de música (clamp a su duración).
    const mStart = music.clip.start as number;
    const relM = (sec: number) =>
      Math.max(0, Math.min(mDur, Math.round(vStart + (sec * fps - vTrim) / vRate - mStart)));
    const kf = new Map<number, number>();
    for (const w of voiceWindows) {
      const a = relM(w.from), b = relM(w.to);
      if (b - a < ramp) continue;
      kf.set(Math.max(0, a - ramp), 1);
      kf.set(a, level);
      kf.set(b, level);
      kf.set(b + ramp, 1);
    }
    if (kf.size === 0) return ok("No se detectaron ventanas de voz claras.");
    const commands: Command[] = [...kf.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([frame, value]) => ({
        type: "add_keyframe",
        clipId: args.musicClipId,
        property: "volume",
        keyframe: { frame, value, easing: "ease-in-out" },
      }));
    await postCommands(commands);
    return ok(`Auto-ducking: ${voiceWindows.length} ventanas de voz → música a ${level} en ${args.musicClipId}.`);
  }),
);

// ---- Edición fina: slip / roll --------------------------------------------

server.registerTool(
  "slip_clip",
  {
    title: "Slip (deslizar contenido)",
    description:
      "Cambia QUÉ parte del medio se ve sin mover el clip en la timeline (ajusta trimStart). Solo video/audio. delta en frames (+ avanza el contenido).",
    inputSchema: { clipId: z.string(), deltaFrames: z.number() },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    if (!("trimStart" in f.clip)) return fail("Slip solo aplica a video/audio (con trimStart).");
    const trimStart = Math.max(0, ((f.clip.trimStart as number) ?? 0) + args.deltaFrames);
    await postCommands([{ type: "update_clip", clipId: args.clipId, patch: { trimStart } }]);
    return ok(`Slip ${args.clipId}: trimStart=${trimStart}.`);
  }),
);

server.registerTool(
  "roll_edit",
  {
    title: "Roll (mover el corte entre dos clips)",
    description:
      "Mueve el límite entre dos clips contiguos (A a la izquierda, B a la derecha) sin dejar hueco: alarga A y acorta B (o viceversa). delta>0 alarga A. B debe tener trimStart (video/audio) para mantener sincronía.",
    inputSchema: { clipIdA: z.string(), clipIdB: z.string(), deltaFrames: z.number() },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const a = locateClip(doc, args.clipIdA);
    const b = locateClip(doc, args.clipIdB);
    if (!a || !b) return ok("Clip A o B no encontrado.");
    if ((a.clip.start as number) + (a.clip.duration as number) !== (b.clip.start as number)) {
      return fail("Los clips A y B no son contiguos (A debe terminar justo donde empieza B).");
    }
    const d = args.deltaFrames;
    const aDur = (a.clip.duration as number) + d;
    const bStart = (b.clip.start as number) + d;
    const bDur = (b.clip.duration as number) - d;
    if (aDur < 1 || bDur < 1) return fail("El roll dejaría un clip con duración < 1.");
    const bPatch: Record<string, unknown> = { start: bStart, duration: bDur };
    if ("trimStart" in b.clip) bPatch.trimStart = Math.max(0, ((b.clip.trimStart as number) ?? 0) + d);
    await postCommands([
      { type: "update_clip", clipId: args.clipIdA, patch: { duration: aDur } },
      { type: "update_clip", clipId: args.clipIdB, patch: bPatch },
    ]);
    return ok(`Roll: A.dur=${aDur}, B.start=${bStart}, B.dur=${bDur}.`);
  }),
);

// ---- Snap points + export de subtítulos -----------------------------------

server.registerTool(
  "get_snap_points",
  {
    title: "Puntos de snap",
    description:
      "Devuelve los frames a los que conviene alinear (bordes de clips + marcadores). Redondea a estos antes de move_clip/add_clip para alineación exacta. Opcional: filtra por trackId.",
    inputSchema: { trackId: z.string().optional() },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const points = new Set<number>([0, doc.durationInFrames]);
    for (const t of doc.tracks) {
      if (args.trackId && t.id !== args.trackId) continue;
      for (const c of t.clips) {
        points.add(c.start as number);
        points.add((c.start as number) + (c.duration as number));
      }
    }
    const markers = ((doc as unknown as { markers?: { frame: number }[] }).markers) ?? [];
    for (const m of markers) points.add(m.frame);
    return okJson([...points].filter((f) => f >= 0).sort((a, b) => a - b));
  }),
);

function srtTime(sec: number): string {
  const ms = Math.round((sec % 1) * 1000);
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

server.registerTool(
  "export_captions",
  {
    title: "Exportar subtítulos (SRT/VTT)",
    description:
      "Genera el texto SRT o VTT a partir de los clips de texto de una pista (por nombre, 'Subtítulos' por defecto). Para accesibilidad y SEO en YouTube.",
    inputSchema: {
      trackName: z.string().optional(),
      trackId: z.string().optional(),
      format: z.enum(["srt", "vtt"]).optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const track = args.trackId
      ? doc.tracks.find((t) => t.id === args.trackId)
      : doc.tracks.find((t) => t.name === (args.trackName ?? "Subtítulos"));
    if (!track) return fail("Pista de subtítulos no encontrada.");
    const fps = doc.fps;
    const cues = track.clips
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .sort((a, b) => (a.start as number) - (b.start as number));
    if (cues.length === 0) return fail("La pista no tiene clips de texto.");
    const format = args.format ?? "srt";
    const lines: string[] = format === "vtt" ? ["WEBVTT", ""] : [];
    cues.forEach((c, i) => {
      const s = (c.start as number) / fps;
      const e = ((c.start as number) + (c.duration as number)) / fps;
      if (format === "vtt") {
        lines.push(`${srtTime(s).replace(",", ".")} --> ${srtTime(e).replace(",", ".")}`);
        lines.push(String(c.text), "");
      } else {
        lines.push(String(i + 1), `${srtTime(s)} --> ${srtTime(e)}`, String(c.text), "");
      }
    });
    return ok(lines.join("\n"));
  }),
);

// ---- Plantillas de títulos animados ---------------------------------------

interface TitleSpec extends Record<string, unknown> {
  kind: "text" | "shape";
  start: number;
  duration: number;
}
function buildTitle(template: string, text: string, ctx: { fps: number; width: number; height: number }): TitleSpec[] {
  const { fps, height } = ctx;
  const dur = fps * 4;
  const anim = (preset: string, d: number, easing = "ease-out") => ({ preset, durationInFrames: d, easing });
  switch (template) {
    case "title-card":
      return [{ kind: "text", start: 0, duration: dur, text, fontSize: Math.round(height * 0.13), fontWeight: 800, color: "#ffffff", textAlign: "center", strokeColor: "#000000", strokeWidth: 2, x: 0, y: 0, animationIn: anim("pop", 20, "spring"), animationOut: anim("fade", 15) }];
    case "pop-callout":
      return [{ kind: "text", start: 0, duration: fps * 3, text, fontSize: Math.round(height * 0.08), fontWeight: 900, color: "#fde047", textAlign: "center", strokeColor: "#000000", strokeWidth: 6, shadowColor: "#000000", shadowBlur: 12, shadowOffsetX: 0, shadowOffsetY: 4, x: 0, y: -height / 4, animationIn: anim("pop", 16, "spring"), animationOut: anim("zoom-out", 10) }];
    case "kinetic-line":
      return [{ kind: "text", start: 0, duration: dur, text, fontSize: Math.round(height * 0.1), fontWeight: 800, color: "#ffffff", textAlign: "center", x: 0, y: 0, animationIn: anim("slide-up", 14), animationOut: anim("fade", 12), keyframeTracks: [{ property: "scale", keyframes: [{ frame: 0, value: 0.9, easing: "ease-out" }, { frame: 8, value: 1.06, easing: "ease-out" }, { frame: 16, value: 1, easing: "ease-in-out" }] }] }];
    case "corner-tag":
      return [{ kind: "text", start: 0, duration: fps * 6, text, fontSize: Math.round(height * 0.035), fontWeight: 700, color: "#ffffff", textAlign: "right", x: ctx.width / 2 - 180, y: -height / 2 + 70, animationIn: anim("blur", 12), animationOut: anim("fade", 10) }];
    case "subtitle-bar":
      return [{ kind: "text", start: 0, duration: fps * 3, text, fontSize: Math.round(height * 0.05), fontWeight: 700, color: "#ffffff", backgroundColor: "rgba(0,0,0,0.6)", textAlign: "center", x: 0, y: height / 2 - 120, animationIn: anim("fade", 8), animationOut: anim("fade", 8) }];
    case "lower-third":
    default: {
      const w = Math.min(900, ctx.width * 0.6);
      const y = height / 2 - 160;
      const x = -ctx.width / 2 + w / 2 + 80;
      return [
        { kind: "shape", start: 0, duration: fps * 5, shape: "rect", fill: "#0ea5e9", width: w, height: 96, cornerRadius: 8, x, y, opacity: 0.92, animationIn: anim("slide-left", 14), animationOut: anim("fade", 12) },
        { kind: "text", start: 2, duration: fps * 5 - 2, text, fontSize: 48, fontWeight: 700, color: "#ffffff", textAlign: "left", width: w - 48, x, y, animationIn: anim("slide-left", 18), animationOut: anim("fade", 12) },
      ];
    }
  }
}

server.registerTool(
  "add_title",
  {
    title: "Añadir título animado",
    description:
      "Inserta una plantilla de título animado (lower-third, title-card, pop-callout, kinetic-line, subtitle-bar, corner-tag) ya con estilo y animación. Crea clips de texto/forma en una pista 'Títulos'. start (frame de inicio) por defecto 0 (alias: frame).",
    inputSchema: {
      template: z.enum(["lower-third", "title-card", "pop-callout", "kinetic-line", "subtitle-bar", "corner-tag"]),
      text: z.string(),
      start: z.coerce.number().optional(),
      frame: z.coerce.number().optional(),
      trackId: z.string().optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const at = Math.max(0, Math.round(args.start ?? args.frame ?? 0));
    const specs = buildTitle(args.template, args.text, { fps: doc.fps, width: doc.width, height: doc.height });

    const commands: Command[] = [];
    let trackId = args.trackId;
    if (!trackId) {
      const existing = doc.tracks.find((t) => t.name === "Títulos");
      if (existing) trackId = existing.id;
      else {
        const track = buildTrack({ name: "Títulos", kind: "media" });
        trackId = track.id as string;
        commands.push({ type: "add_track", track });
      }
    }

    const ids: string[] = [];
    for (const spec of specs) {
      const { kind, start, duration, ...rest } = spec;
      const clip: Record<string, unknown> = {
        type: kind,
        ...baseClip({ name: kind === "shape" ? "Barra" : "Título", start: at + start, duration }),
        ...rest, // sobreescribe animationIn/Out, keyframeTracks, width, x, y, etc.
      };
      if (kind === "shape" && clip.shape === undefined) clip.shape = "rect";
      if (kind === "shape") {
        clip.fill = clip.fill ?? "#0ea5e9";
        clip.strokeWidth = clip.strokeWidth ?? 0;
        clip.cornerRadius = clip.cornerRadius ?? 0;
      }
      ids.push(clip.id as string);
      commands.push({ type: "add_clip", trackId, clip });
    }
    await postCommands(commands);
    return ok(`Título '${args.template}' insertado en frame ${at}. clipIds=${ids.join(",")}`);
  }),
);

// ---- Clipper (separar un video largo en clips virales) --------------------

interface TranscriptSegment { start: number; end: number; text: string }
interface TranscriptData { language: string; durationSec: number; segments: TranscriptSegment[] }

function formatTranscript(t: TranscriptData): string {
  const lines = t.segments.map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)}s] ${s.text}`);
  return `idioma=${t.language} duración=${t.durationSec.toFixed(1)}s · ${t.segments.length} segmentos\n${lines.join("\n")}`;
}

server.registerTool(
  "ingest_local_file",
  {
    title: "Importar archivo del disco",
    description:
      "Copia un archivo de video/imagen/audio del disco del usuario a la biblioteca del editor (devuelve su src servible /assets/..). Úsalo antes de transcribir o clippear un video local.",
    inputSchema: { path: z.string(), name: z.string().optional() },
  },
  tool(async (args) => okJson(await postJson("/api/assets/ingest", { path: args.path, name: args.name }))),
);

server.registerTool(
  "detect_language",
  {
    title: "Detectar idioma",
    description:
      "Detecta el idioma del audio (local, langid de Whisper) SIN transcribir. Devuelve language, confidence, confident y candidatos (top). Si confident=false, pregunta al usuario qué idioma antes de transcribir.",
    inputSchema: { src: z.string() },
  },
  tool(async (args) => okJson(await getJson(`/api/transcribe?detect=1&src=${encodeURIComponent(args.src)}`))),
);

server.registerTool(
  "transcribe_source",
  {
    title: "Transcribir video (local)",
    description:
      "Transcribe un video/audio LOCALMENTE (Whisper, sin APIs) y devuelve los segmentos con timestamps para que elijas los mejores momentos. src debe ser servible (/assets/..) o una URL. language opcional (p.ej. 'es', 'en'); por defecto autodetecta.",
    inputSchema: { src: z.string(), language: z.string().optional(), maxWaitSec: z.number().optional() },
  },
  tool(async (args) => {
    const r = (await postJson("/api/transcribe", { src: args.src, language: args.language })) as {
      status?: string;
      transcript?: TranscriptData;
      jobId?: string;
      detection?: { top: { language: string; prob: number }[] };
    };
    if (r.status === "needs_language" && r.detection) {
      const opts = r.detection.top.map((t) => `${t.language} ${(t.prob * 100).toFixed(0)}%`).join(", ");
      return ok(
        `IDIOMA INCIERTO. Candidatos: ${opts}. Pregunta al usuario y vuelve a llamar transcribe_source con language="<código>" (p.ej. "es", "en", "pt").`,
      );
    }
    if (r.transcript) return ok(formatTranscript(r.transcript));
    const jobId = r.jobId;
    const maxWait = (args.maxWaitSec ?? 600) * 1000;
    const t0 = Date.now();
    while (Date.now() - t0 < maxWait) {
      await sleep(3000);
      const s = (await getJson(`/api/transcribe?id=${jobId}`)) as {
        status: string;
        error?: string;
        transcript?: TranscriptData;
      };
      if (s.status === "done" && s.transcript) return ok(formatTranscript(s.transcript));
      if (s.status === "error") return fail(s.error ?? "error de transcripción");
    }
    return ok(`Transcripción en proceso. Reintenta get_transcript con src=${args.src}.`);
  }),
);

server.registerTool(
  "get_transcript",
  {
    title: "Obtener transcript",
    description: "Devuelve el transcript cacheado de un src (segmentos con timestamps).",
    inputSchema: { src: z.string() },
  },
  tool(async (args) => {
    const r = (await getJson(`/api/transcribe?src=${encodeURIComponent(args.src)}`)) as {
      transcript?: TranscriptData;
    } | null;
    if (!r?.transcript) return ok("No hay transcript aún. Llama a transcribe_source primero.");
    return ok(formatTranscript(r.transcript));
  }),
);

server.registerTool(
  "create_clip_from_source",
  {
    title: "Crear clip viral desde un fuente",
    description:
      "Crea un PROYECTO de clip recortando el video fuente entre startSec y endSec. Por defecto vertical 9:16 con subtítulos del tramo. Devuelve el id del proyecto (ábrelo con open_project). Tú eliges start/end tras leer el transcript.",
    inputSchema: {
      sourceSrc: z.string(),
      startSec: z.number(),
      endSec: z.number(),
      title: z.string().optional(),
      sourceId: z.string().optional(),
      vertical: z.boolean().optional(),
      withCaptions: z.boolean().optional(),
      fps: z.number().optional(),
    },
  },
  tool(async (args) => {
    const fps = args.fps ?? 30;
    const vertical = args.vertical ?? true;
    const width = vertical ? 1080 : 1920;
    const height = vertical ? 1920 : 1080;
    const dur = Math.max(1, Math.round((args.endSec - args.startSec) * fps));
    const trimStart = Math.max(0, Math.round(args.startSec * fps));

    const videoClip = {
      type: "video",
      ...baseClip({ name: "Fuente", start: 0, duration: dur }),
      src: args.sourceSrc,
      trimStart,
      volume: 1,
      muted: false,
      playbackRate: 1,
      fit: "cover",
      width,
      height,
    };
    const videoTrack = buildTrack({ name: "Video", kind: "media" });
    videoTrack.clips = [videoClip];
    const tracks: Record<string, unknown>[] = [videoTrack];

    if (args.withCaptions ?? true) {
      const tr = (await getJson(`/api/transcribe?src=${encodeURIComponent(args.sourceSrc)}`)) as {
        transcript?: TranscriptData;
      } | null;
      const segs = tr?.transcript?.segments ?? [];
      const caps: unknown[] = [];
      for (const s of segs) {
        if (s.end <= args.startSec || s.start >= args.endSec) continue;
        const rel = Math.max(0, s.start - args.startSec);
        const relEnd = Math.min(args.endSec, s.end) - args.startSec;
        caps.push({
          type: "text",
          ...baseClip({ name: "Subtítulo", start: Math.round(rel * fps), duration: Math.max(1, Math.round((relEnd - rel) * fps)) }),
          text: s.text,
          fontFamily: "Inter",
          fontSize: 64,
          fontWeight: 800,
          color: "#ffffff",
          textAlign: "center",
          lineHeight: 1.2,
          letterSpacing: 0,
          italic: false,
          strokeColor: "#000000",
          strokeWidth: 8,
          shadowColor: "#000000",
          shadowBlur: 8,
          shadowOffsetX: 0,
          shadowOffsetY: 2,
          y: Math.round(height / 2 - 240),
        });
      }
      if (caps.length) {
        const capTrack = buildTrack({ name: "Subtítulos", kind: "media" });
        capTrack.clips = caps;
        tracks.push(capTrack);
      }
    }

    const document = {
      version: 1,
      id: newId("proj"),
      name: args.title ?? "Clip",
      width,
      height,
      fps,
      durationInFrames: dur,
      backgroundColor: "#000000",
      tracks,
    };
    const meta = (await postJson("/api/projects", {
      name: document.name,
      kind: "clip",
      sourceId: args.sourceId,
      document,
    })) as { id?: string } | null;
    return ok(
      `Clip "${document.name}" creado (${(args.endSec - args.startSec).toFixed(1)}s, ${width}x${height}). Proyecto id=${meta?.id}. Ábrelo con open_project.`,
    );
  }),
);

server.registerTool(
  "auto_caption",
  {
    title: "Auto-subtítulos (clip de la timeline)",
    description:
      "Transcribe LOCALMENTE el video/audio de un clip de la timeline y genera su pista de subtítulos alineada a su posición (respeta trimStart/duración). preset: youtube|tiktok|minimal|bold. animated:true = subtítulos KARAOKE a nivel de palabra (estilo TikTok: cada palabra se resalta al pronunciarse).",
    inputSchema: {
      clipId: z.string(),
      preset: z.enum(["youtube", "tiktok", "minimal", "bold"]).optional(),
      language: z.string().optional(),
      animated: z.boolean().optional(),
    },
  },
  tool(async (args) => {
    const doc = await getDoc();
    const f = locateClip(doc, args.clipId);
    if (!f) return ok(`Clip ${args.clipId} no encontrado.`);
    const src = f.clip.src as string | undefined;
    if (!src) return ok("El clip no tiene src (debe ser video/audio).");
    const fps = doc.fps;

    // --- Subtítulos KARAOKE a nivel de palabra ---
    if (args.animated) {
      const wr = (await postJson("/api/transcribe", { src, language: args.language, words: true })) as {
        status?: string;
        words?: { words: WordStampMcp[] };
        jobId?: string;
        detection?: { top: { language: string; prob: number }[] };
      };
      if (wr.status === "needs_language" && wr.detection) {
        const opts = wr.detection.top.map((t) => `${t.language} ${(t.prob * 100).toFixed(0)}%`).join(", ");
        return ok(`IDIOMA INCIERTO para auto_caption. Candidatos: ${opts}. Pregunta al usuario y vuelve a llamar con language="<código>".`);
      }
      let wordData = wr.words;
      if (!wordData && wr.jobId) {
        const t0 = Date.now();
        while (Date.now() - t0 < 900000) {
          await sleep(3000);
          const s = (await getJson(`/api/transcribe?id=${wr.jobId}`)) as { status: string; words?: { words: WordStampMcp[] } };
          if (s.status === "done" && s.words) { wordData = s.words; break; }
          if (s.status === "error") return ok("Error transcribiendo (palabras).");
        }
      }
      if (!wordData) return ok("Transcripción por palabra no disponible (reintenta).");

      const trimStart = typeof f.clip.trimStart === "number" ? f.clip.trimStart : 0;
      // La ventana de FUENTE abarca duration*rate (un clip 2× consume el doble de
      // segundos de fuente); el mapeo de vuelta a timeline divide por rate.
      const rate = typeof f.clip.playbackRate === "number" && f.clip.playbackRate > 0 ? f.clip.playbackRate : 1;
      const winStart = trimStart / fps;
      const winEnd = winStart + (f.clip.duration * rate) / fps;
      const vertical = doc.height > doc.width;
      const presetProps = CAPTION_PRESETS[args.preset ?? (vertical ? "tiktok" : "youtube")];
      const yPos = (presetProps.y as number) ?? Math.round(doc.height / 2 - 140);

      const win = wordData.words
        .filter((w) => w.end > winStart && w.start < winEnd)
        .map((w) => ({ text: w.text, start: Math.max(0, w.start - winStart), end: Math.min(winEnd, w.end) - winStart }))
        .filter((w) => w.end > w.start);
      const cues = groupWordsIntoCues(win, vertical);

      const commands: Command[] = [];
      let trackId = doc.tracks.find((t) => t.name === "Subtítulos")?.id;
      if (!trackId) {
        const track = buildTrack({ name: "Subtítulos", kind: "media" });
        trackId = track.id as string;
        commands.push({ type: "add_track", track });
      }
      // Defaults base; el preset los sobreescribe (sin literales "muertos" tras el spread).
      const baseStyle = {
        fontFamily: "Inter", fontSize: 96, fontWeight: 800, color: "#ffffff",
        textAlign: "center", lineHeight: 1.2, letterSpacing: 0, italic: false,
        strokeColor: "#000000", strokeWidth: 10, shadowColor: "rgba(0,0,0,0.6)", shadowBlur: 24, shadowOffsetX: 0, shadowOffsetY: 2,
      };
      for (const cue of cues) {
        // Tiempo de FUENTE → TIMELINE: /rate (1s de fuente = 1/rate s de timeline).
        const clipStart = f.clip.start + Math.round((cue.startSec / rate) * fps);
        const dur = Math.max(1, Math.round(((cue.endSec - cue.startSec) / rate) * fps));
        const words = cue.words.map((w) => {
          const s = Math.max(0, Math.round(((w.start - cue.startSec) / rate) * fps));
          const e = Math.max(s + 1, Math.round(((w.end - cue.startSec) / rate) * fps));
          return { text: w.text, start: s, end: e };
        });
        commands.push({
          type: "add_clip",
          trackId,
          clip: {
            type: "text",
            ...baseClip({ name: "Subtítulo", start: clipStart, duration: dur }),
            ...baseStyle,
            text: cue.text,
            ...presetProps, y: yPos, words, activeColor: "#ffe000", activeScale: 1.12,
          },
        });
      }
      const made = commands.filter((c) => c.type === "add_clip").length;
      if (made === 0) return ok("No hay palabras dentro del rango del clip.");
      await postCommands(commands);
      return ok(`${made} subtítulos ANIMADOS (karaoke) generados para ${args.clipId} en la pista ${trackId}.`);
    }

    // Transcribir (o usar caché) y esperar.
    let transcript: TranscriptData | undefined;
    const r = (await postJson("/api/transcribe", { src, language: args.language })) as {
      status?: string;
      transcript?: TranscriptData;
      jobId?: string;
      detection?: { top: { language: string; prob: number }[] };
    };
    if (r.status === "needs_language" && r.detection) {
      const opts = r.detection.top.map((t) => `${t.language} ${(t.prob * 100).toFixed(0)}%`).join(", ");
      return ok(
        `IDIOMA INCIERTO para auto_caption. Candidatos: ${opts}. Pregunta al usuario y vuelve a llamar con language="<código>".`,
      );
    }
    if (r.transcript) transcript = r.transcript;
    else {
      const t0 = Date.now();
      while (Date.now() - t0 < 900000) {
        await sleep(3000);
        const s = (await getJson(`/api/transcribe?id=${r.jobId}`)) as {
          status: string;
          transcript?: TranscriptData;
        };
        if (s.status === "done" && s.transcript) {
          transcript = s.transcript;
          break;
        }
        if (s.status === "error") return ok("Error transcribiendo el clip.");
      }
    }
    if (!transcript) return ok("Transcripción no disponible (reintenta).");

    const trimStart = typeof f.clip.trimStart === "number" ? f.clip.trimStart : 0;
    const rate = typeof f.clip.playbackRate === "number" && f.clip.playbackRate > 0 ? f.clip.playbackRate : 1;
    const winStart = trimStart / fps;
    const winEnd = winStart + (f.clip.duration * rate) / fps;
    const presetProps = CAPTION_PRESETS[args.preset ?? "youtube"];
    const yPos = (presetProps.y as number) ?? Math.round(doc.height / 2 - 140);

    const commands: Command[] = [];
    let trackId = doc.tracks.find((t) => t.name === "Subtítulos")?.id;
    if (!trackId) {
      const track = buildTrack({ name: "Subtítulos", kind: "media" });
      trackId = track.id as string;
      commands.push({ type: "add_track", track });
    }
    let count = 0;
    for (const s of transcript.segments) {
      if (s.end <= winStart || s.start >= winEnd) continue;
      // Fuente → timeline: /rate (segmentos en segundos de fuente).
      const rel = Math.max(0, s.start - winStart) / rate;
      const relEnd = (Math.min(winEnd, s.end) - winStart) / rate;
      commands.push({
        type: "add_clip",
        trackId,
        clip: {
          type: "text",
          ...baseClip({ name: "Subtítulo", start: f.clip.start + Math.round(rel * fps), duration: Math.max(1, Math.round((relEnd - rel) * fps)) }),
          text: s.text,
          fontFamily: "Inter",
          fontSize: 64,
          fontWeight: 800,
          color: "#ffffff",
          textAlign: "center",
          lineHeight: 1.2,
          letterSpacing: 0,
          italic: false,
          strokeColor: "#000000",
          strokeWidth: 8,
          shadowColor: "#000000",
          shadowBlur: 8,
          shadowOffsetX: 0,
          shadowOffsetY: 2,
          ...presetProps,
          y: yPos,
        },
      });
      count++;
    }
    if (count === 0) return ok("No hay segmentos de transcripción dentro del rango del clip.");
    await postCommands(commands);
    return ok(`${count} subtítulos generados para ${args.clipId} en la pista ${trackId}.`);
  }),
);

// ---- Historial ------------------------------------------------------------

server.registerTool(
  "undo",
  {
    title: "Deshacer",
    description: "Deshace el último cambio del documento. Devuelve si quedan acciones para deshacer/rehacer.",
    inputSchema: {},
  },
  tool(async () => {
    const res = await postJson("/api/document/undo", {});
    return okJson(res);
  }),
);

server.registerTool(
  "redo",
  {
    title: "Rehacer",
    description: "Rehace el último cambio deshecho.",
    inputSchema: {},
  },
  tool(async () => {
    const res = await postJson("/api/document/redo", {});
    return okJson(res);
  }),
);

// ---- Versiones (snapshots persistentes) -----------------------------------

server.registerTool(
  "list_versions",
  {
    title: "Listar versiones",
    description:
      "Lista las instantáneas (snapshots) guardadas del proyecto actual: id, etiqueta, auto/manual, versión y fecha, de la más reciente a la más antigua. Persisten en disco (sobreviven al reinicio).",
    inputSchema: {},
  },
  tool(async () => okJson(await getJson("/api/versions"))),
);

server.registerTool(
  "save_version",
  {
    title: "Guardar versión",
    description:
      "Guarda una instantánea PERSISTENTE del proyecto actual con una etiqueta opcional. Sobrevive al reinicio de la app. Úsala antes de un cambio grande o como hito ('v1 aprobada'). Devuelve la metadata del snapshot.",
    inputSchema: { label: z.string().optional() },
  },
  tool(async (args) => okJson(await postJson("/api/versions", { label: args.label }))),
);

server.registerTool(
  "restore_version",
  {
    title: "Restaurar versión",
    description:
      "Restaura el proyecto a una instantánea anterior por id (de list_versions). DESTRUCTIVO: reemplaza el documento actual, pero antes guarda un snapshot automático 'Antes de restaurar' para poder volver. El editor abierto se actualiza en vivo.",
    inputSchema: { id: z.string() },
  },
  tool(async (args) => {
    await postJson("/api/versions/restore", { id: args.id });
    return ok(`Versión ${args.id} restaurada (se guardó un snapshot del estado previo).`);
  }),
);

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[cutgent-mcp] Servidor MCP conectado. Base URL = ${getBase()}`);
}

main().catch((err) => {
  console.error("[cutgent-mcp] Error fatal:", err);
  process.exit(1);
});
