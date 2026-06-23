import "server-only";
import { getDocument, dispatchBatch } from "../server-store";
import { findClip, type Command } from "../commands";
import { getMatteProvider } from "./index";
import { getVfxJob, updateVfxJob } from "../vfx-jobs";
import { downloadToAsset } from "../generation/download";
import { publicMediaUrl } from "../tracking/run";

/**
 * Orquesta un job de matting: resuelve URL del media → provider.start → poll →
 * parseOutput (URL del recorte) → si es remota la localiza con downloadToAsset, si
 * ya es local la usa directa → update_clip(alphaMatte.src). NUNCA lanza (refleja el
 * estado en el job). Clon de tracking/run.ts divergiendo solo en el output.
 */

/** Provider real vs mock, por-llamada. */
export function selectedMatteProviderId(): string {
  return process.env.CUTGENT_MATTE_PROVIDER === "mock" ? "mock" : "fal-veed";
}

export async function runMatting(
  jobId: string,
  providerId: string,
  clipId: string,
  key: string,
  model: string,
): Promise<void> {
  try {
    const provider = getMatteProvider(providerId);
    if (!provider) throw new Error(`Proveedor de matting desconocido: ${providerId}`);

    const doc = await getDocument();
    const found = findClip(doc, clipId);
    if (!found) throw new Error(`Clip ${clipId} no encontrado`);
    const clip = found.clip;
    if (clip.type !== "video" && clip.type !== "image") {
      throw new Error(`Clip de tipo ${clip.type} no es matteable (usa video o image)`);
    }
    const src = clip.src;
    if (!src) throw new Error("El clip no tiene src");

    const start = await provider.startMatte(publicMediaUrl(src), key, model);

    const deadline = Date.now() + 720_000; // 12 min
    let poll = await provider.pollMatte(start.predId, key);
    while (poll.status === "pending" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      poll = await provider.pollMatte(start.predId, key);
      const cur = getVfxJob(jobId)?.progress ?? 0;
      updateVfxJob(jobId, { progress: Math.max(cur, poll.progress ?? Math.min(0.9, cur + 0.05)) });
    }
    if (poll.status === "error") throw new Error(poll.error || "El matting falló");
    if (poll.status !== "done") throw new Error("El matting superó el tiempo de espera");

    const url = provider.parseOutput(poll.output);
    if (!url) throw new Error("El modelo no devolvió un recorte");

    // URL remota → localizar como asset; URL ya local (mock/asset) → usar directa.
    let matteSrc: string;
    if (/^https?:\/\//i.test(url)) {
      const asset = await downloadToAsset({ url, kind: "video", name: `matte_${clipId}` });
      matteSrc = asset.src;
    } else {
      matteSrc = url;
    }

    const cmds: Command[] = [{ type: "update_clip", clipId, patch: { alphaMatte: { src: matteSrc } } }];
    await dispatchBatch(cmds, null);

    updateVfxJob(jobId, { status: "done", progress: 1, matteSrc });
  } catch (e) {
    updateVfxJob(jobId, { status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}
