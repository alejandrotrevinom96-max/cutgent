/**
 * Stock media search across Pexels and Pixabay.
 *
 * This module runs server-side only (it reads API keys from process.env).
 * Neither provider exposes a stable public API for music/audio, so only
 * `image` and `video` kinds are supported.
 *
 * If an API key is missing or a provider request fails, we DO NOT throw:
 * the affected provider is skipped and a human-readable warning (in Spanish)
 * is collected so the caller can surface it in the UI.
 */

import { getPexelsKey, getPixabayKey } from "./settings-store";

export type StockProvider = "pexels" | "pixabay";
export type StockKind = "image" | "video";

export interface StockResult {
  id: string;
  provider: StockProvider;
  kind: StockKind;
  title: string;
  previewUrl: string;
  downloadUrl: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface StockSearchResponse {
  results: StockResult[];
  warnings: string[];
}

const PER_PAGE = 24;

// ---------------------------------------------------------------------------
// Pexels response shapes (only the fields we use)
// ---------------------------------------------------------------------------

interface PexelsPhotoSrc {
  large2x?: string;
  large?: string;
  medium?: string;
}

interface PexelsPhoto {
  id: number;
  alt?: string;
  width?: number;
  height?: number;
  src?: PexelsPhotoSrc;
}

interface PexelsPhotosResponse {
  photos?: PexelsPhoto[];
}

interface PexelsVideoFile {
  link?: string;
  quality?: string;
  width?: number;
  height?: number;
  file_type?: string;
}

interface PexelsVideo {
  id: number;
  width?: number;
  height?: number;
  duration?: number;
  image?: string;
  url?: string;
  video_files?: PexelsVideoFile[];
}

interface PexelsVideosResponse {
  videos?: PexelsVideo[];
}

// ---------------------------------------------------------------------------
// Pixabay response shapes (only the fields we use)
// ---------------------------------------------------------------------------

interface PixabayImageHit {
  id: number;
  tags?: string;
  previewURL?: string;
  webformatURL?: string;
  largeImageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
}

interface PixabayImageResponse {
  hits?: PixabayImageHit[];
}

interface PixabayVideoSize {
  url?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
}

interface PixabayVideoHit {
  id: number;
  tags?: string;
  duration?: number;
  videos?: {
    large?: PixabayVideoSize;
    medium?: PixabayVideoSize;
    small?: PixabayVideoSize;
    tiny?: PixabayVideoSize;
  };
}

interface PixabayVideoResponse {
  hits?: PixabayVideoHit[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pick the best mp4 file from a Pexels video: prefer quality "hd", otherwise
 * the largest file whose width is <= 1920 (falls back to the first file).
 */
function pickPexelsVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | undefined {
  const mp4s = files.filter(
    (f) => !!f.link && (f.file_type === "video/mp4" || /\.mp4(\?|$)/i.test(f.link ?? "")),
  );
  const pool = mp4s.length > 0 ? mp4s : files.filter((f) => !!f.link);
  if (pool.length === 0) return undefined;

  const hd = pool.find((f) => f.quality === "hd");
  if (hd) return hd;

  const within = pool
    .filter((f) => (f.width ?? 0) <= 1920)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  if (within.length > 0) return within[0];

  return [...pool].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))[0];
}

// ---------------------------------------------------------------------------
// Pexels
// ---------------------------------------------------------------------------

export async function searchPexels(
  query: string,
  type: StockKind,
): Promise<StockResult[]> {
  const apiKey = await getPexelsKey();
  if (!apiKey) throw new Error("Falta la API key de Pexels (Ajustes)");

  const headers: HeadersInit = { Authorization: apiKey };
  const q = encodeURIComponent(query);

  if (type === "image") {
    const url = `https://api.pexels.com/v1/search?query=${q}&per_page=${PER_PAGE}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Pexels respondió ${res.status}`);
    }
    const data = (await res.json()) as PexelsPhotosResponse;
    const photos = data.photos ?? [];
    return photos.flatMap((p): StockResult[] => {
      const downloadUrl = p.src?.large2x ?? p.src?.large;
      const previewUrl = p.src?.medium ?? p.src?.large ?? downloadUrl;
      if (!downloadUrl || !previewUrl) return [];
      return [
        {
          id: `pexels_${p.id}`,
          provider: "pexels",
          kind: "image",
          title: p.alt && p.alt.trim().length > 0 ? p.alt : `Pexels ${p.id}`,
          previewUrl,
          downloadUrl,
          width: p.width,
          height: p.height,
        },
      ];
    });
  }

  // video
  const url = `https://api.pexels.com/videos/search?query=${q}&per_page=${PER_PAGE}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Pexels respondió ${res.status}`);
  }
  const data = (await res.json()) as PexelsVideosResponse;
  const videos = data.videos ?? [];
  return videos.flatMap((v): StockResult[] => {
    const file = pickPexelsVideoFile(v.video_files ?? []);
    const downloadUrl = file?.link;
    const previewUrl = v.image;
    if (!downloadUrl || !previewUrl) return [];
    return [
      {
        id: `pexels_${v.id}`,
        provider: "pexels",
        kind: "video",
        title: `Pexels video ${v.id}`,
        previewUrl,
        downloadUrl,
        width: file?.width ?? v.width,
        height: file?.height ?? v.height,
        durationSec: v.duration,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Pixabay
// ---------------------------------------------------------------------------

export async function searchPixabay(
  query: string,
  type: StockKind,
): Promise<StockResult[]> {
  const apiKey = await getPixabayKey();
  if (!apiKey) throw new Error("Falta la API key de Pixabay (Ajustes)");

  const key = encodeURIComponent(apiKey);
  const q = encodeURIComponent(query);

  if (type === "image") {
    const url = `https://pixabay.com/api/?key=${key}&q=${q}&image_type=photo&per_page=${PER_PAGE}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Pixabay respondió ${res.status}`);
    }
    const data = (await res.json()) as PixabayImageResponse;
    const hits = data.hits ?? [];
    return hits.flatMap((h): StockResult[] => {
      const downloadUrl = h.largeImageURL ?? h.webformatURL;
      const previewUrl = h.previewURL ?? h.webformatURL;
      if (!downloadUrl || !previewUrl) return [];
      return [
        {
          id: `pixabay_${h.id}`,
          provider: "pixabay",
          kind: "image",
          title: h.tags && h.tags.trim().length > 0 ? h.tags : `Pixabay ${h.id}`,
          previewUrl,
          downloadUrl,
          width: h.imageWidth,
          height: h.imageHeight,
        },
      ];
    });
  }

  // video
  const url = `https://pixabay.com/api/videos/?key=${key}&q=${q}&per_page=${PER_PAGE}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Pixabay respondió ${res.status}`);
  }
  const data = (await res.json()) as PixabayVideoResponse;
  const hits = data.hits ?? [];
  return hits.flatMap((h): StockResult[] => {
    const size = h.videos?.large ?? h.videos?.medium;
    const downloadUrl = h.videos?.large?.url ?? h.videos?.medium?.url;
    const previewUrl = h.videos?.medium?.thumbnail ?? h.videos?.tiny?.thumbnail;
    if (!downloadUrl || !previewUrl) return [];
    return [
      {
        id: `pixabay_${h.id}`,
        provider: "pixabay",
        kind: "video",
        title: h.tags && h.tags.trim().length > 0 ? h.tags : `Pixabay video ${h.id}`,
        previewUrl,
        downloadUrl,
        width: size?.width,
        height: size?.height,
        durationSec: h.duration,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

export async function searchStock(
  query: string,
  type: StockKind,
  provider: StockProvider | "all",
): Promise<StockSearchResponse> {
  const warnings: string[] = [];

  if (type !== "image" && type !== "video") {
    warnings.push(
      "Solo se admiten resultados de imagen o video (Pexels/Pixabay no exponen audio por API).",
    );
    return { results: [], warnings };
  }

  const wantPexels = provider === "pexels" || provider === "all";
  const wantPixabay = provider === "pixabay" || provider === "all";

  const tasks: Array<Promise<StockResult[]>> = [];

  if (wantPexels) {
    if (!(await getPexelsKey())) {
      warnings.push("Falta la API key de Pexels — añádela en Ajustes.");
    } else {
      tasks.push(
        searchPexels(query, type).catch((err: unknown) => {
          warnings.push(
            `Pexels: ${err instanceof Error ? err.message : "error desconocido"}`,
          );
          return [];
        }),
      );
    }
  }

  if (wantPixabay) {
    if (!(await getPixabayKey())) {
      warnings.push("Falta la API key de Pixabay — añádela en Ajustes.");
    } else {
      tasks.push(
        searchPixabay(query, type).catch((err: unknown) => {
          warnings.push(
            `Pixabay: ${err instanceof Error ? err.message : "error desconocido"}`,
          );
          return [];
        }),
      );
    }
  }

  const settled = await Promise.all(tasks);
  const results = settled.flat();

  return { results, warnings };
}
