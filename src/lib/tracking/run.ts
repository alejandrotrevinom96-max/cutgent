import "server-only";
import { getDocument, dispatchBatch } from "../server-store";
import { findClip, type Command } from "../commands";
import { listAssets } from "../asset-store";
import { getTrackProvider } from "./index";
import { getVfxJob, updateVfxJob } from "../vfx-jobs";
import { trackerBboxToKeyframes, type TrackMapOptions } from "../track-map";

/**
 * Orquesta un job de tracking: resuelve la URL del media → provider.start → poll
 * → parseOutput → trackerBboxToKeyframes (RDP ya adentro) → dispatchBatch de
 * set_track_keyframes. NUNCA lanza (refleja el estado en el job). Extraído de la
 * ruta para poder verificar el pipeline sin levantar Next.
 */

/** Provider real vs mock, evaluado POR LLAMADA (no al cargar módulo). */
export function selectedProviderId(): string {
  return process.env.CUTGENT_TRACK_PROVIDER === "mock" ? "mock" : "replicate-sam2";
}

/** URL pública absoluta del media para que el proveedor pueda descargarlo. */
export function publicMediaUrl(src: string): string {
  if (src.startsWith("http")) return src;
  const base = process.env.CUTGENT_PUBLIC_URL || process.env.CUTGENT_URL || "http://localhost:3000";
  return `${base}${src}`;
}

export async function runTracking(
  jobId: string,
  providerId: string,
  clipId: string,
  key: string,
  model: string,
): Promise<void> {
  try {
    const provider = getTrackProvider(providerId);
    if (!provider) throw new Error(`Proveedor de tracking desconocido: ${providerId}`);

    const doc = await getDocument();
    const found = findClip(doc, clipId);
    if (!found) throw new Error(`Clip ${clipId} no encontrado`);
    const clip = found.clip;
    if (clip.type !== "video" && clip.type !== "image") {
      throw new Error(`Clip de tipo ${clip.type} no es trackeable (usa video o image)`);
    }
    const src = clip.src;
    if (!src) throw new Error("El clip no tiene src");

    // Dims intrínsecas: del Asset cuyo src coincide (no hay getAsset → listAssets+find).
    const assets = await listAssets();
    const asset = assets.find((a) => a.src === src || a.proxySrc === src);
    const media = { width: asset?.width ?? doc.width, height: asset?.height ?? doc.height };

    const start = await provider.startTrack(publicMediaUrl(src), key, model);

    const deadline = Date.now() + 720_000; // 12 min
    let poll = await provider.pollTrack(start.predId, key);
    while (poll.status === "pending" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      poll = await provider.pollTrack(start.predId, key);
      const cur = getVfxJob(jobId)?.progress ?? 0;
      updateVfxJob(jobId, { progress: Math.max(cur, poll.progress ?? Math.min(0.9, cur + 0.05)) });
    }
    if (poll.status === "error") throw new Error(poll.error || "El tracking falló");
    if (poll.status !== "done") throw new Error("El tracking superó el tiempo de espera");

    const boxes = provider.parseOutput(poll.output, media);
    if (boxes.length === 0) throw new Error("El tracker no devolvió cajas");

    const opts: TrackMapOptions = {
      canvas: { width: doc.width, height: doc.height },
      clip: {
        width: clip.width,
        height: clip.height,
        fit: clip.fit,
        trimStart: "trimStart" in clip ? clip.trimStart : 0,
      },
      intrinsic: media,
      animateScale: true,
      animateOpacity: true,
    };
    const kfs = trackerBboxToKeyframes(boxes, opts); // RDP ya adentro

    const cmds: Command[] = [];
    for (const prop of ["x", "y", "scale", "opacity"] as const) {
      const arr = kfs[prop];
      if (arr && arr.length) cmds.push({ type: "set_track_keyframes", clipId, property: prop, keyframes: arr });
    }
    if (cmds.length) await dispatchBatch(cmds, null); // un undo, un broadcast (snapshot)

    updateVfxJob(jobId, {
      status: "done",
      progress: 1,
      keyframes: kfs,
      postedProps: cmds.map((c) => (c as { property: string }).property),
    });
  } catch (e) {
    updateVfxJob(jobId, { status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}
