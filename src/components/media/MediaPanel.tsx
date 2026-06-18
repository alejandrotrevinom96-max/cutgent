"use client";

import { useEffect, useState } from "react";
import {
  Type,
  Square,
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
  Upload,
  Link as LinkIcon,
  Sparkles,
  Trash2,
  Search,
  Film,
  Loader2,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { createClip, createTrack, newId } from "@/lib/factory";
import type { Asset, ClipType, Track } from "@/lib/schema";
import type { Command } from "@/lib/commands";

/** Tipos de clip que pueden originarse desde un asset de la biblioteca. */
type AssetClipType = Extract<ClipType, "image" | "video" | "audio">;

/** Mapea el kind de un asset al tipo de clip equivalente. */
const assetKindToClipType: Record<Asset["kind"], AssetClipType> = {
  image: "image",
  video: "video",
  audio: "audio",
};

/** Tipo de medio buscado en proveedores de stock. */
type StockType = "video" | "image";

/** Proveedor de stock seleccionado en la búsqueda. */
type StockProvider = "pexels" | "pixabay" | "both";

/** Un resultado individual devuelto por /api/stock/search. */
interface StockResult {
  id: string;
  title: string;
  previewUrl: string;
  downloadUrl: string;
  provider?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

/** Respuesta esperada de /api/stock/search. */
interface StockSearchResponse {
  results?: StockResult[];
  warnings?: string[];
}

/**
 * Panel izquierdo de medios: añade elementos rápidos, gestiona la biblioteca de
 * assets (subir, importar por URL, eliminar) y explica el flujo de medios IA.
 */
export function MediaPanel() {
  const document = useEditor((s) => s.document);
  const currentFrame = useEditor((s) => s.currentFrame);
  const assets = useEditor((s) => s.assets);
  const runCommand = useEditor((s) => s.runCommand);
  const runCommands = useEditor((s) => s.runCommands);
  const refreshAssets = useEditor((s) => s.refreshAssets);

  // Inputs de "Añadir por URL"
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  // Inputs de "Importar por URL" (a la biblioteca)
  const [importName, setImportName] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importKind, setImportKind] = useState<Asset["kind"]>("image");

  const [uploading, setUploading] = useState(false);

  // Estado de "Buscar stock"
  const [stockQuery, setStockQuery] = useState("");
  const [stockType, setStockType] = useState<StockType>("video");
  const [stockProvider, setStockProvider] = useState<StockProvider>("both");
  const [stockResults, setStockResults] = useState<StockResult[]>([]);
  const [stockWarnings, setStockWarnings] = useState<string[]>([]);
  const [stockSearching, setStockSearching] = useState(false);
  const [stockSearched, setStockSearched] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    void refreshAssets();
  }, [refreshAssets]);

  /** Devuelve el id de la primera pista del kind pedido; la crea si no existe. */
  function ensureTrack(kind: Track["kind"]): {
    trackId: string;
    extraCommand?: Command;
  } {
    const existing = document.tracks.find((t) => t.kind === kind);
    if (existing) return { trackId: existing.id };

    const track = createTrack({
      kind,
      name: kind === "audio" ? "Audio" : "Pista de video",
    });
    return { trackId: track.id, extraCommand: { type: "add_track", track } };
  }

  /** Añade un clip ya construido a la pista adecuada según su tipo. */
  function addClip(type: ClipType, partial: Record<string, unknown>): void {
    const kind: Track["kind"] = type === "audio" ? "audio" : "media";
    const { trackId, extraCommand } = ensureTrack(kind);
    const clip = createClip(type, { start: currentFrame, duration: 90, ...partial });
    const addCommand: Command = { type: "add_clip", trackId, clip };

    if (extraCommand) {
      void runCommands([extraCommand, addCommand]);
    } else {
      void runCommand(addCommand);
    }
  }

  /** Añade un clip a partir de un asset de la biblioteca. */
  function addAssetClip(asset: Asset): void {
    const type = assetKindToClipType[asset.kind];
    addClip(type, {
      src: asset.src,
      name: asset.name,
      ...(asset.durationInFrames ? { duration: asset.durationInFrames } : {}),
    });
  }

  /** Crea un clip desde una URL escrita por el usuario y limpia el input. */
  function addByUrl(type: AssetClipType, url: string, reset: () => void): void {
    const src = url.trim();
    if (!src) return;
    addClip(type, { src });
    reset();
  }

  async function handleUpload(file: File | undefined): Promise<void> {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await fetch("/api/assets/upload", { method: "POST", body: form });
      await refreshAssets();
    } catch {
      /* fallo de subida: la biblioteca simplemente no se actualiza */
    } finally {
      setUploading(false);
    }
  }

  async function handleImportUrl(): Promise<void> {
    const src = importUrl.trim();
    const name = importName.trim() || src;
    if (!src) return;
    const asset: Asset = { id: newId("asset"), name, kind: importKind, src };
    try {
      await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset }),
      });
      await refreshAssets();
      setImportName("");
      setImportUrl("");
    } catch {
      /* fallo de importación */
    }
  }

  async function handleDeleteAsset(id: string): Promise<void> {
    try {
      await fetch(`/api/assets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refreshAssets();
    } catch {
      /* fallo al eliminar */
    }
  }

  /** Busca medios de stock en el proveedor seleccionado. */
  async function handleStockSearch(): Promise<void> {
    const q = stockQuery.trim();
    if (!q || stockSearching) return;

    setStockSearching(true);
    setStockError(null);
    setStockWarnings([]);
    setStockResults([]);
    setStockSearched(true);

    try {
      const params = new URLSearchParams({
        q,
        type: stockType,
        provider: stockProvider,
      });
      const res = await fetch(`/api/stock/search?${params.toString()}`);
      if (!res.ok) {
        setStockError("No se pudo completar la búsqueda. Inténtalo de nuevo.");
        return;
      }
      const data = (await res.json()) as StockSearchResponse;
      setStockResults(Array.isArray(data.results) ? data.results : []);
      setStockWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    } catch {
      setStockError("Error de red al buscar stock. Revisa tu conexión.");
    } finally {
      setStockSearching(false);
    }
  }

  /**
   * Importa un resultado de stock a la biblioteca y, si procede, lo añade a la
   * línea de tiempo en el frame actual.
   */
  async function handleStockImport(result: StockResult): Promise<void> {
    if (importingId) return;
    const kind: Asset["kind"] = stockType === "image" ? "image" : "video";
    setImportingId(result.id);
    try {
      const res = await fetch("/api/stock/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: result.downloadUrl,
          kind,
          name: result.title,
          width: result.width,
          height: result.height,
          durationSec: result.durationSec,
        }),
      });
      if (!res.ok) return;

      const asset = (await res.json()) as Asset;
      await refreshAssets();

      // Añade a la línea de tiempo si tenemos un src utilizable.
      if (asset && typeof asset.src === "string" && asset.src) {
        const type = assetKindToClipType[asset.kind] ?? kind;
        // Duración real del clip = segundos del stock × fps del proyecto (antes
        // entraba a 90f / 3s por defecto). Fallback a durationInFrames del asset.
        const duration = result.durationSec
          ? Math.max(1, Math.round(result.durationSec * document.fps))
          : asset.durationInFrames;
        addClip(type, {
          src: asset.src,
          name: asset.name,
          ...(duration ? { duration } : {}),
        });
      }
    } catch {
      /* fallo de importación: el resultado simplemente no se añade */
    } finally {
      setImportingId(null);
    }
  }

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col overflow-y-auto border-r border-border bg-panel text-text">
      {/* ----------------------------------------------------------------- */}
      {/* Añadir elemento                                                    */}
      {/* ----------------------------------------------------------------- */}
      <Section title="Añadir elemento">
        <div className="grid grid-cols-3 gap-2">
          <QuickButton
            icon={<Type size={18} />}
            label="Texto"
            onClick={() => addClip("text", {})}
          />
          <QuickButton
            icon={<Square size={18} />}
            label="Forma"
            onClick={() => addClip("shape", {})}
          />
          <QuickButton
            icon={<Square size={18} className="fill-current" />}
            label="Sólido"
            onClick={() => addClip("solid", {})}
          />
        </div>

        <UrlAdder
          icon={<ImageIcon size={14} />}
          placeholder="URL de imagen"
          value={imageUrl}
          onChange={setImageUrl}
          onAdd={() => addByUrl("image", imageUrl, () => setImageUrl(""))}
        />
        <UrlAdder
          icon={<VideoIcon size={14} />}
          placeholder="URL de video"
          value={videoUrl}
          onChange={setVideoUrl}
          onAdd={() => addByUrl("video", videoUrl, () => setVideoUrl(""))}
        />
        <UrlAdder
          icon={<Music size={14} />}
          placeholder="URL de audio"
          value={audioUrl}
          onChange={setAudioUrl}
          onAdd={() => addByUrl("audio", audioUrl, () => setAudioUrl(""))}
        />
      </Section>

      {/* ----------------------------------------------------------------- */}
      {/* Biblioteca                                                         */}
      {/* ----------------------------------------------------------------- */}
      <Section title="Biblioteca">
        {assets.length === 0 ? (
          <p className="text-xs text-muted">
            No hay medios todavía. Sube un archivo o importa por URL.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {assets.map((asset) => (
              <li key={asset.id}>
                <div className="group flex items-center gap-2 rounded-md border border-border bg-panel-2 p-1.5">
                  <button
                    type="button"
                    onClick={() => addAssetClip(asset)}
                    title={`Añadir ${asset.name} a la línea de tiempo`}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <AssetThumb asset={asset} />
                    <span className="min-w-0 flex-1 truncate text-xs">{asset.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteAsset(asset.id)}
                    title="Eliminar de la biblioteca"
                    className="shrink-0 rounded p-1 text-muted opacity-0 transition hover:bg-border hover:text-[var(--danger)] group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ----------------------------------------------------------------- */}
      {/* Buscar stock                                                       */}
      {/* ----------------------------------------------------------------- */}
      <Section title="Buscar stock">
        <div className="flex items-center gap-1.5">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            type="text"
            placeholder="Buscar (p. ej. naturaleza)"
            value={stockQuery}
            onChange={(e) => setStockQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleStockSearch();
            }}
            className="min-w-0 flex-1 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={stockType}
            onChange={(e) => setStockType(e.target.value as StockType)}
            className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
          >
            <option value="video">Video</option>
            <option value="image">Imagen</option>
          </select>
          <select
            value={stockProvider}
            onChange={(e) => setStockProvider(e.target.value as StockProvider)}
            className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
          >
            <option value="pexels">Pexels</option>
            <option value="pixabay">Pixabay</option>
            <option value="both">Ambos</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => void handleStockSearch()}
          disabled={stockSearching || !stockQuery.trim()}
          className="flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stockSearching ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Buscando…
            </>
          ) : (
            <>
              <Search size={14} /> Buscar
            </>
          )}
        </button>

        {/* Avisos amables (p. ej. falta de API key). */}
        {stockWarnings.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-md border border-[var(--warning,#a16207)] bg-panel-2 p-2">
            {stockWarnings.map((w, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-[var(--warning,#eab308)]">
                {w}
              </li>
            ))}
          </ul>
        )}

        {/* Estados de la búsqueda. */}
        {stockError ? (
          <p className="text-xs text-[var(--danger,#ef4444)]">{stockError}</p>
        ) : stockSearching ? (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Loader2 size={14} className="animate-spin" /> Buscando resultados…
          </p>
        ) : stockSearched && stockResults.length === 0 ? (
          <p className="text-xs text-muted">
            No se encontraron resultados. Prueba con otra búsqueda.
          </p>
        ) : stockResults.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {stockResults.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => void handleStockImport(result)}
                disabled={importingId !== null}
                title={`Importar y añadir: ${result.title}`}
                className="group relative aspect-video overflow-hidden rounded-md border border-border bg-track text-left transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {result.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.previewUrl}
                    alt={result.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted">
                    {stockType === "image" ? <ImageIcon size={18} /> : <Film size={18} />}
                  </span>
                )}
                <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white">
                  {stockType === "image" ? <ImageIcon size={12} /> : <Film size={12} />}
                </span>
                {importingId === result.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
                    <Loader2 size={18} className="animate-spin" />
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : null}
      </Section>

      {/* ----------------------------------------------------------------- */}
      {/* Subir                                                              */}
      {/* ----------------------------------------------------------------- */}
      <Section title="Subir">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-panel-2 px-3 py-3 text-xs text-muted transition hover:border-accent hover:text-text">
          <Upload size={16} />
          <span>{uploading ? "Subiendo…" : "Elegir archivo (imagen/video/audio)"}</span>
          <input
            type="file"
            accept="image/*,video/*,audio/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              void handleUpload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        <div className="mt-3 flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
            <LinkIcon size={12} /> Importar por URL
          </p>
          <input
            type="text"
            placeholder="Nombre"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
          <input
            type="text"
            placeholder="https://…"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
          <select
            value={importKind}
            onChange={(e) => setImportKind(e.target.value as Asset["kind"])}
            className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
          >
            <option value="image">Imagen</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
          </select>
          <button
            type="button"
            onClick={() => void handleImportUrl()}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-2"
          >
            Importar a la biblioteca
          </button>
        </div>
      </Section>

      {/* ----------------------------------------------------------------- */}
      {/* Generar con IA (informativo)                                       */}
      {/* ----------------------------------------------------------------- */}
      <Section title="Generar con IA">
        <div className="rounded-md border border-border bg-panel-2 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-accent-2">
            <Sparkles size={14} /> Medios generados por IA
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Los medios generados con IA se traen por URL: este panel no llama a
            ninguna API de IA por sí mismo.
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-[11px] leading-relaxed text-muted">
            <li>
              Pídeselo al asistente: él genera la imagen, el video o el audio y lo
              importa automáticamente con la herramienta{" "}
              <span className="text-text">MCP</span>.
            </li>
            <li>
              O pega tú mismo el enlace del medio en{" "}
              <span className="text-text">Importar por URL</span> para añadirlo a
              la biblioteca y luego a la línea de tiempo.
            </li>
          </ul>
        </div>
      </Section>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-border p-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function QuickButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-md border border-border bg-panel-2 px-2 py-2.5 text-[11px] text-text transition hover:border-accent hover:bg-border"
    >
      <span className="text-accent">{icon}</span>
      {label}
    </button>
  );
}

function UrlAdder({
  icon,
  placeholder,
  value,
  onChange,
  onAdd,
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-muted">{icon}</span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onAdd();
        }}
        className="min-w-0 flex-1 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={onAdd}
        className="shrink-0 rounded-md bg-panel-2 px-2 py-1.5 text-xs text-muted transition hover:bg-accent hover:text-white"
      >
        +
      </button>
    </div>
  );
}

function AssetThumb({ asset }: { asset: Asset }) {
  const base =
    "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-track text-muted";

  if (asset.kind === "image" && (asset.thumbnail || asset.src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.thumbnail ?? asset.src}
        alt={asset.name}
        className="h-9 w-9 shrink-0 rounded object-cover"
      />
    );
  }

  switch (asset.kind) {
    case "video":
      return (
        <span className={base}>
          <VideoIcon size={16} />
        </span>
      );
    case "audio":
      return (
        <span className={base}>
          <Music size={16} />
        </span>
      );
    default:
      return (
        <span className={base}>
          <ImageIcon size={16} />
        </span>
      );
  }
}
