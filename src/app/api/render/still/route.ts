import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { selectComposition, renderStill, ensureBrowser } from "@remotion/renderer";
import { getDocument } from "@/lib/server-store";
import { newId } from "@/lib/factory";
import { absolutizeAssets, bundleRemotion } from "@/lib/remotion-bundle";
import { rendersDir as rendersDirPath } from "@/lib/paths";
import { shouldWatermark } from "@/lib/license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/render/still  { frame?, format? }
 * Exporta UN frame del proyecto como imagen (poster/miniatura para YouTube).
 * Es rápido (un solo frame) → responde sincrónicamente con { url }.
 */
export async function POST(req: Request) {
  let serveUrl: string | undefined;
  try {
    const { frame = 0, format = "jpeg" } = await req.json().catch(() => ({}));
    const origin = new URL(req.url).origin;
    const document = absolutizeAssets(await getDocument(), origin);
    const imageFormat = format === "png" ? "png" : "jpeg";
    const ext = imageFormat === "png" ? "png" : "jpg";

    await ensureBrowser();
    serveUrl = await bundleRemotion();
    // Mismo gate server-side que el render de video: el poster en trial lleva marca.
    const inputProps = { document, watermark: await shouldWatermark() };
    const composition = await selectComposition({ serveUrl, id: "MainVideo", inputProps });

    const rendersDir = rendersDirPath();
    await fs.mkdir(rendersDir, { recursive: true });
    const id = newId("still");
    const output = path.join(rendersDir, `${id}.${ext}`);

    const clamped = Math.max(0, Math.min(Math.round(frame), composition.durationInFrames - 1));
    await renderStill({ composition, serveUrl, output, frame: clamped, inputProps, imageFormat });

    return NextResponse.json({ url: `/renders/${id}.${ext}`, frame: clamped });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  } finally {
    if (serveUrl) await fs.rm(serveUrl, { recursive: true, force: true }).catch(() => {});
  }
}
