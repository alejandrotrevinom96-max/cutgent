import { z } from "zod";
import {
  AnimatablePropertySchema,
  AnimationSchema,
  ClipSchema,
  EasingSchema,
  EffectSchema,
  KeyframeSchema,
  MarkerSchema,
  ProjectSchema,
  TrackSchema,
  type Clip,
  type KeyframeTrack,
  type Project,
  type Track,
} from "./schema";

/**
 * Commands are the ONLY way the document mutates. The editor UI, the HTTP API,
 * and the MCP server all produce these, and `applyCommand` is the single pure
 * reducer that applies them. Keeping it pure (no id/date generation inside)
 * makes it deterministic and trivially testable — callers generate ids.
 */

export const CommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set_project_settings"),
    patch: ProjectSchema.partial().omit({ tracks: true, id: true }),
  }),
  z.object({ type: z.literal("load_document"), document: ProjectSchema }),

  z.object({ type: z.literal("add_track"), track: TrackSchema, index: z.number().optional() }),
  z.object({ type: z.literal("remove_track"), trackId: z.string() }),
  z.object({
    type: z.literal("update_track"),
    trackId: z.string(),
    patch: TrackSchema.partial().omit({ id: true, clips: true }),
  }),
  z.object({ type: z.literal("reorder_track"), trackId: z.string(), index: z.number() }),

  z.object({ type: z.literal("add_clip"), trackId: z.string(), clip: ClipSchema }),
  z.object({ type: z.literal("remove_clip"), clipId: z.string() }),
  z.object({
    type: z.literal("update_clip"),
    clipId: z.string(),
    // free-form patch validated loosely; applyCommand merges shallowly.
    patch: z.record(z.string(), z.any()),
  }),
  z.object({
    type: z.literal("move_clip"),
    clipId: z.string(),
    start: z.number(),
    trackId: z.string().optional(),
  }),
  z.object({ type: z.literal("duplicate_clip"), clipId: z.string(), newId: z.string() }),
  z.object({
    type: z.literal("split_clip"),
    clipId: z.string(),
    /** Absolute timeline frame to cut at. */
    frame: z.number(),
    newId: z.string(),
  }),

  z.object({
    type: z.literal("set_animation"),
    clipId: z.string(),
    in: AnimationSchema.optional(),
    out: AnimationSchema.optional(),
  }),
  z.object({
    type: z.literal("add_keyframe"),
    clipId: z.string(),
    property: AnimatablePropertySchema,
    keyframe: KeyframeSchema,
  }),
  z.object({
    type: z.literal("remove_keyframe"),
    clipId: z.string(),
    property: AnimatablePropertySchema,
    frame: z.number(),
  }),

  z.object({ type: z.literal("add_effect"), clipId: z.string(), effect: EffectSchema }),
  z.object({ type: z.literal("remove_effect"), clipId: z.string(), index: z.number() }),

  z.object({ type: z.literal("ripple_delete"), clipId: z.string() }),
  z.object({ type: z.literal("add_marker"), marker: MarkerSchema }),
  z.object({ type: z.literal("remove_marker"), markerId: z.string() }),
  z.object({
    type: z.literal("update_marker"),
    markerId: z.string(),
    patch: MarkerSchema.partial().omit({ id: true }),
  }),
]);

export type Command = z.infer<typeof CommandSchema>;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function findClip(
  doc: Project,
  clipId: string,
): { track: Track; clip: Clip; trackIndex: number; clipIndex: number } | null {
  for (let ti = 0; ti < doc.tracks.length; ti++) {
    const track = doc.tracks[ti];
    const ci = track.clips.findIndex((c) => c.id === clipId);
    if (ci !== -1) {
      return { track, clip: track.clips[ci], trackIndex: ti, clipIndex: ci };
    }
  }
  return null;
}

const cloneDeep = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// Structural-sharing helpers: only the changed track/clip is reallocated; the
// rest of the document is shared by reference. Each edit is O(clips in one
// track), not O(whole document) — essential for 20–40 min projects. None of
// these mutate the input, so optimistic client updates stay safe.

function mapTrack(doc: Project, trackId: string, fn: (t: Track) => Track): Project {
  let changed = false;
  const tracks = doc.tracks.map((t) => {
    if (t.id !== trackId) return t;
    changed = true;
    return fn(t);
  });
  return changed ? { ...doc, tracks } : doc;
}

/** Replace (or delete, if fn returns null) a clip by id, sharing everything else. */
function withClip(doc: Project, clipId: string, fn: (c: Clip) => Clip | null): Project {
  let changed = false;
  const tracks = doc.tracks.map((track) => {
    const idx = track.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return track;
    changed = true;
    const clips = track.clips.slice();
    const res = fn(clips[idx]);
    if (res === null) clips.splice(idx, 1);
    else clips[idx] = res;
    return { ...track, clips };
  });
  return changed ? { ...doc, tracks } : doc;
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function applyCommand(doc: Project, command: Command): Project {
  switch (command.type) {
    case "load_document":
      return cloneDeep(command.document);

    case "set_project_settings":
      return { ...doc, ...command.patch };

    case "add_track": {
      const at = command.index ?? doc.tracks.length;
      const tracks = doc.tracks.slice();
      tracks.splice(at, 0, command.track);
      return { ...doc, tracks };
    }

    case "remove_track":
      return { ...doc, tracks: doc.tracks.filter((t) => t.id !== command.trackId) };

    case "update_track":
      return mapTrack(doc, command.trackId, (t) => ({ ...t, ...command.patch }));

    case "reorder_track": {
      const from = doc.tracks.findIndex((t) => t.id === command.trackId);
      if (from === -1) return doc;
      const tracks = doc.tracks.slice();
      const [t] = tracks.splice(from, 1);
      tracks.splice(Math.max(0, Math.min(command.index, tracks.length)), 0, t);
      return { ...doc, tracks };
    }

    case "add_clip":
      return mapTrack(doc, command.trackId, (t) => ({ ...t, clips: [...t.clips, command.clip] }));

    case "remove_clip":
      return withClip(doc, command.clipId, () => null);

    case "update_clip":
      return withClip(doc, command.clipId, (c) => {
        // id y type son inmutables; valida el clip resultante y, si el patch lo
        // dejaría inválido, lo IGNORA (evita corromper el doc → wipe al recargar).
        const { id: _id, type: _type, ...patch } = command.patch as Record<string, unknown>;
        void _id;
        void _type;
        // Merge PROFUNDO de objetos anidados: un patch parcial de colorGrade/crop/
        // animación NO debe borrar los campos no incluidos (Zod los rellenaría con
        // su default → pérdida silenciosa de datos del usuario).
        const cur = c as unknown as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...patch };
        for (const k of ["colorGrade", "crop", "animationIn", "animationOut"]) {
          const pv = patch[k];
          const cv = cur[k];
          if (pv && typeof pv === "object" && !Array.isArray(pv) && cv && typeof cv === "object") {
            merged[k] = { ...(cv as object), ...(pv as object) };
          }
        }
        const candidate = { ...c, ...merged };
        const parsed = ClipSchema.safeParse(candidate);
        return parsed.success ? parsed.data : c;
      });

    case "move_clip": {
      const found = findClip(doc, command.clipId);
      if (!found) return doc;
      const start = Math.max(0, command.start);
      if (!command.trackId || command.trackId === found.track.id) {
        return withClip(doc, command.clipId, (c) => ({ ...c, start }));
      }
      // cross-track: si la pista destino NO existe, NO quitamos el clip de su
      // origen (antes se perdía). Solo movemos su start.
      const target = doc.tracks.find((t) => t.id === command.trackId);
      if (!target) return withClip(doc, command.clipId, (c) => ({ ...c, start }));
      const moved = { ...found.clip, start };
      const tracks = doc.tracks.map((track) => {
        if (track.id === found.track.id)
          return { ...track, clips: track.clips.filter((c) => c.id !== command.clipId) };
        if (track.id === command.trackId) return { ...track, clips: [...track.clips, moved] };
        return track;
      });
      return { ...doc, tracks };
    }

    case "duplicate_clip": {
      const found = findClip(doc, command.clipId);
      if (!found) return doc;
      const copy = cloneDeep(found.clip);
      copy.id = command.newId;
      copy.name = `${found.clip.name} copia`;
      copy.start = found.clip.start + found.clip.duration;
      return mapTrack(doc, found.track.id, (t) => ({ ...t, clips: [...t.clips, copy] }));
    }

    case "split_clip": {
      const found = findClip(doc, command.clipId);
      if (!found) return doc;
      const { clip } = found;
      const offset = command.frame - clip.start;
      if (offset <= 0 || offset >= clip.duration) return doc;
      // Re-basa los keyframes (son relativos al inicio del clip): la primera
      // mitad conserva [0,offset); la segunda toma [offset,…) desplazado a 0.
      const rebase = (
        tracks: KeyframeTrack[],
        lo: number,
        hi: number,
        shift: number,
      ): KeyframeTrack[] =>
        tracks.map((kt) => ({
          ...kt,
          keyframes: kt.keyframes
            .filter((k) => k.frame >= lo && k.frame < hi)
            .map((k) => ({ ...k, frame: k.frame - shift })),
        }));

      const second = cloneDeep(clip);
      second.id = command.newId;
      second.start = command.frame;
      second.duration = clip.duration - offset;
      second.keyframeTracks = rebase(clip.keyframeTracks, offset, Infinity, offset);
      if ("trimStart" in second && typeof second.trimStart === "number") {
        // trimStart está en frames de FUENTE; offset está en frames de TIMELINE.
        // Con playbackRate ≠ 1 hay que escalar (coherente con resize-left).
        const rate = "playbackRate" in second && typeof second.playbackRate === "number"
          ? (second.playbackRate as number)
          : 1;
        second.trimStart = second.trimStart + Math.round(offset * rate);
      }
      return mapTrack(doc, found.track.id, (t) => ({
        ...t,
        clips: [
          ...t.clips.map((c) =>
            c.id === command.clipId
              ? { ...c, duration: offset, keyframeTracks: rebase(c.keyframeTracks, 0, offset, 0) }
              : c,
          ),
          second,
        ],
      }));
    }

    case "set_animation":
      return withClip(doc, command.clipId, (c) => {
        const next = { ...c };
        if (command.in) next.animationIn = command.in;
        if (command.out) next.animationOut = command.out;
        return next;
      });

    case "add_keyframe":
      return withClip(doc, command.clipId, (c) => {
        const idx = c.keyframeTracks.findIndex((k) => k.property === command.property);
        const keyframeTracks = c.keyframeTracks.slice();
        if (idx === -1) {
          keyframeTracks.push({ property: command.property, keyframes: [command.keyframe] });
        } else {
          const keyframes = keyframeTracks[idx].keyframes
            .filter((k) => k.frame !== command.keyframe.frame)
            .concat(command.keyframe)
            .sort((a, b) => a.frame - b.frame);
          keyframeTracks[idx] = { ...keyframeTracks[idx], keyframes };
        }
        return { ...c, keyframeTracks };
      });

    case "remove_keyframe":
      return withClip(doc, command.clipId, (c) => {
        const idx = c.keyframeTracks.findIndex((k) => k.property === command.property);
        if (idx === -1) return c;
        const keyframeTracks = c.keyframeTracks.slice();
        keyframeTracks[idx] = {
          ...keyframeTracks[idx],
          keyframes: keyframeTracks[idx].keyframes.filter((k) => k.frame !== command.frame),
        };
        return { ...c, keyframeTracks };
      });

    case "add_effect":
      return withClip(doc, command.clipId, (c) => ({ ...c, effects: [...c.effects, command.effect] }));

    case "remove_effect":
      return withClip(doc, command.clipId, (c) => {
        const effects = c.effects.slice();
        effects.splice(command.index, 1);
        return { ...c, effects };
      });

    case "ripple_delete": {
      const found = findClip(doc, command.clipId);
      if (!found) return doc;
      const at = found.clip.start;
      const dur = found.clip.duration;
      const trackId = found.track.id;
      const tracks = doc.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const clips = t.clips
          .filter((c) => c.id !== command.clipId)
          .map((c) => (c.start >= at ? { ...c, start: Math.max(0, c.start - dur) } : c));
        return { ...t, clips };
      });
      return { ...doc, tracks };
    }

    case "add_marker":
      return { ...doc, markers: [...(doc.markers ?? []), command.marker] };

    case "remove_marker":
      return { ...doc, markers: (doc.markers ?? []).filter((m) => m.id !== command.markerId) };

    case "update_marker":
      return {
        ...doc,
        markers: (doc.markers ?? []).map((m) =>
          m.id === command.markerId ? { ...m, ...command.patch } : m,
        ),
      };

    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}

/** Apply many commands in sequence. */
export function applyCommands(doc: Project, commands: Command[]): Project {
  return commands.reduce(applyCommand, doc);
}
