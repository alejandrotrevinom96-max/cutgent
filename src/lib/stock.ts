/**
 * Stock media search across Pexels, Pixabay (image/video) plus Jamendo (música)
 * and Freesound (SFX) for audio.
 *
 * This module runs server-side only (it reads API keys from process.env).
 * Pexels/Pixabay no exponen audio por API estable → para audio usamos Jamendo
 * (catálogo Creative Commons, campo `audio` = mp3 directo con client_id) y
 * Freesound (efectos CC; los `previews` preview-hq-mp3 son mp3 públicos usables
 * solo con el token, sin el OAuth2 que sí exige el archivo original).
 *
 * If an API key is missing or a provider request fails, we DO NOT throw:
 * the affected provider is skipped and a human-readable warning (in Spanish)
 * is collected so the caller can surface it in the UI.
 */

import {
  getPexelsKey,
  getPixabayKey,
  getJamendoKey,
  getFreesoundKey,
} from "./settings-store";

export type StockProvider = "pexels" | "pixabay" | "jamendo" | "freesound";
export type StockKind = "image" | "video" | "audio";

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
// Jamendo (música Creative Commons)
// ---------------------------------------------------------------------------

interface JamendoTrack {
  id?: string | number;
  name?: string;
  artist_name?: string;
  duration?: number;
  /** URL de stream mp3, reproducible/descargable SOLO con el client_id (sin OAuth). */
  audio?: string;
  image?: string; // carátula del álbum (sirve de miniatura)
  license_ccurl?: string;
}

interface JamendoResponse {
  headers?: { status?: string; error_message?: string };
  results?: JamendoTrack[];
}

export async function searchJamendo(query: string): Promise<StockResult[]> {
  const clientId = await getJamendoKey();
  if (!clientId) throw new Error("Falta el client_id de Jamendo (Ajustes)");

  const q = encodeURIComponent(query);
  // Jamendo EXIGE el client_id por query string (no admite header). Es server-side
  // y este módulo no loguea URLs; si algún día se añade logging, enmascararlo.
  const url =
    `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(clientId)}` +
    `&format=json&limit=${PER_PAGE}&search=${q}&audioformat=mp32&order=popularity_total`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jamendo respondió ${res.status}`);

  const data = (await res.json()) as JamendoResponse;
  if (data.headers?.status && data.headers.status !== "success") {
    throw new Error(data.headers.error_message || "error de Jamendo");
  }
  const tracks = data.results ?? [];
  return tracks.flatMap((t): StockResult[] => {
    const downloadUrl = t.audio;
    if (!downloadUrl) return [];
    const title = t.name
      ? t.artist_name
        ? `${t.name} — ${t.artist_name}`
        : t.name
      : `Jamendo ${t.id}`;
    return [
      {
        id: `jamendo_${t.id}`,
        provider: "jamendo",
        kind: "audio",
        title,
        previewUrl: t.image ?? "",
        downloadUrl,
        durationSec: t.duration,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Freesound (efectos de sonido Creative Commons)
// ---------------------------------------------------------------------------

interface FreesoundSound {
  id?: number;
  name?: string;
  username?: string;
  duration?: number;
  license?: string;
  /** Mapa con preview-hq-mp3 / preview-lq-mp3 (mp3 públicos, usables con token). */
  previews?: Record<string, string>;
  /** Mapa con waveform_m / spectral_m (imágenes para miniatura). */
  images?: Record<string, string>;
}

interface FreesoundResponse {
  results?: FreesoundSound[];
  detail?: string;
}

export async function searchFreesound(query: string): Promise<StockResult[]> {
  const token = await getFreesoundKey();
  if (!token) throw new Error("Falta el token de Freesound (Ajustes)");

  const q = encodeURIComponent(query);
  // 'previews' y 'duration' NO vienen por defecto: hay que pedir fields explícito.
  const fields = "id,name,previews,duration,username,license,images";
  const url =
    `https://freesound.org/apiv2/search/text/?query=${q}` +
    `&page_size=${PER_PAGE}&fields=${fields}&sort=score`;
  // Token por header (no en la URL) para no filtrarlo en logs.
  const res = await fetch(url, { headers: { Authorization: `Token ${token}` } });
  if (!res.ok) throw new Error(`Freesound respondió ${res.status}`);

  const data = (await res.json()) as FreesoundResponse;
  const sounds = data.results ?? [];
  return sounds.flatMap((s): StockResult[] => {
    const downloadUrl =
      s.previews?.["preview-hq-mp3"] ?? s.previews?.["preview-lq-mp3"];
    if (!downloadUrl) return [];
    const previewUrl = s.images?.["waveform_m"] ?? s.images?.["waveform_l"] ?? "";
    return [
      {
        id: `freesound_${s.id}`,
        provider: "freesound",
        kind: "audio",
        title: s.name ?? `Freesound ${s.id}`,
        previewUrl,
        downloadUrl,
        durationSec: s.duration,
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
  const errMsg = (err: unknown) =>
    err instanceof Error ? err.message : "error desconocido";

  if (type !== "image" && type !== "video" && type !== "audio") {
    warnings.push("Tipo de medio no admitido (image | video | audio).");
    return { results: [], warnings };
  }

  // Audio → Jamendo (música) / Freesound (SFX). Pexels/Pixabay no exponen audio.
  if (type === "audio") {
    const wantJamendo = provider === "jamendo" || provider === "all";
    const wantFreesound = provider === "freesound" || provider === "all";
    const audioTasks: Array<Promise<StockResult[]>> = [];

    // Combo incompatible (p. ej. type=audio con provider=pexels vía MCP/API):
    // sin esto devolvería [] sin explicación.
    if (!wantJamendo && !wantFreesound) {
      warnings.push("El audio (música/SFX) solo está disponible en Jamendo o Freesound.");
    }

    if (wantJamendo) {
      if (!(await getJamendoKey())) {
        warnings.push("Falta el client_id de Jamendo — añádelo en Ajustes.");
      } else {
        audioTasks.push(
          searchJamendo(query).catch((err: unknown) => {
            warnings.push(`Jamendo: ${errMsg(err)}`);
            return [];
          }),
        );
      }
    }
    if (wantFreesound) {
      if (!(await getFreesoundKey())) {
        warnings.push("Falta el token de Freesound — añádelo en Ajustes.");
      } else {
        audioTasks.push(
          searchFreesound(query).catch((err: unknown) => {
            warnings.push(`Freesound: ${errMsg(err)}`);
            return [];
          }),
        );
      }
    }
    const audioSettled = await Promise.all(audioTasks);
    return { results: audioSettled.flat(), warnings };
  }

  const wantPexels = provider === "pexels" || provider === "all";
  const wantPixabay = provider === "pixabay" || provider === "all";

  // Combo incompatible (p. ej. type=video con provider=jamendo vía MCP/API).
  if (!wantPexels && !wantPixabay) {
    warnings.push("Las imágenes y los videos solo están en Pexels o Pixabay.");
  }

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
