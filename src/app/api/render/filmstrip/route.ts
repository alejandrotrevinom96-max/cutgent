import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { selectComposition, renderStill, ensureBrowser } from "@remotion/renderer";
import { getDocument } from "@/lib/server-store";
import { newId } from "@/lib/factory";
import { absolutizeAssets, bundleRemotion } from "@/lib/remotion-bundle";
import { rendersDir as rendersDirPath } from "@/lib/paths";
import { shouldWatermark } from "@/lib/license";
import { tileFrames } from "@/lib/filmstrip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // primer render baja Chromium; N stills serializados.

const clampInt = (v: unknown, min: number, max: number, def: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def;

/**
 * POST /api/render/filmstrip { startFrame?, endFrame?, count?, columns?, width?, format? }
 * Renderiza N frames equiespaciados de [startFrame,endFrame] (default todo el proyecto)
 * y los une en UNA hoja de contactos (grid) para percibir el MOVIMIENTO.
 */
export async function POST(req: Request) {
  let serveUrl: string | undefined;
  const tmpFiles: string[] = [];
  try {
    const body = await req.json().catch(() => ({}));
    const origin = new URL(req.url).origin;
    const document = absolutizeAssets(await getDocument(), origin);
    const imageFormat = body.format === "png" ? "png" : "jpeg";
    const ext = imageFormat === "png" ? "png" : "jpg";

    await ensureBrowser();
    serveUrl = await bundleRemotion();
    const inputProps = { document, watermark: await shouldWatermark() };
    const composition = await selectComposition({ serveUrl, id: "MainVideo", inputProps });

    const lastFrame = composition.durationInFrames - 1;
    let start = clampInt(body.startFrame, 0, lastFrame, 0);
    let end = clampInt(body.endFrame, 0, lastFrame, lastFrame);
    if (end < start) [start, end] = [end, start];

    const count = clampInt(body.count, 2, 25, 9);
    const thumbW = clampInt(body.width, 80, 640, 320);
    const cols = body.columns != null ? clampInt(body.columns, 2, 10, 3) : Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    const span = end - start;
    const frames: number[] =
      count === 1 ? [start] : Array.from({ length: count }, (_, i) => Math.round(start + (i * span) / (count - 1)));

    const rendersDir = rendersDirPath();
    await fs.mkdir(rendersDir, { recursive: true });
    const id = newId("filmstrip");

    // 1) Render N stills a tmp contiguos _f%03d.<ext> (reusa serveUrl + composition).
    for (let i = 0; i < frames.length; i++) {
      const f = Math.max(0, Math.min(frames[i], lastFrame));
      const tmp = path.join(rendersDir, `${id}_f${String(i).padStart(3, "0")}.${ext}`);
      await renderStill({ composition, serveUrl, output: tmp, frame: f, inputProps, imageFormat });
      tmpFiles.push(tmp);
    }

    // 2) ffmpeg tile → UNA hoja de contactos.
    const output = path.join(rendersDir, `${id}.${ext}`);
    await tileFrames({ pattern: path.join(rendersDir, `${id}_f%03d.${ext}`), output, cols, rows, thumbW });

    return NextResponse.json({ url: `/renders/${id}.${ext}`, frames, frameRange: [start, end], cols, rows, fps: composition.fps });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  } finally {
    if (serveUrl) await fs.rm(serveUrl, { recursive: true, force: true }).catch(() => {});
    await Promise.all(tmpFiles.map((f) => fs.rm(f, { force: true }).catch(() => {})));
  }
}
