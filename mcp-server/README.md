# Servidor MCP de Cutgent

Servidor MCP autónomo que expone **todo** el editor de video Cutgent como
herramientas para Claude Code. No importa nada de la app Next: habla con ella
exclusivamente por HTTP (el contrato fijo de `/api/*`). El documento del video
es la única fuente de verdad y vive en el servidor Next; este MCP solo envía
**comandos**.

> El editor abierto en el navegador refleja los cambios en vivo por SSE: en
> cuanto una herramienta aplica un comando, lo verás aparecer al instante.

## 1. Arranca la app

```bash
npm run dev
```

Por defecto queda en `http://localhost:3000`. Si usas otro host/puerto, define
la variable de entorno `CUTGENT_URL` (ver más abajo).

## 2. Registra el MCP en Claude Code

### Opción A — archivo `.mcp.json` (recomendado, ya incluido en la raíz)

El repo ya trae un `.mcp.json` en la raíz. Claude Code lo detecta
automáticamente al abrir el proyecto. Contenido:

```json
{
  "mcpServers": {
    "cutgent": {
      "command": "npx",
      "args": ["tsx", "mcp-server/index.ts"],
      "env": { "CUTGENT_URL": "http://localhost:3000" }
    }
  }
}
```

### Opción B — comando `claude mcp add`

```bash
claude mcp add cutgent -e CUTGENT_URL=http://localhost:3000 -- npx tsx mcp-server/index.ts
```

También puedes arrancarlo a mano para probar:

```bash
npm run mcp
```

> Logs: el servidor escribe SOLO a stderr. stdout está reservado al protocolo
> stdio del MCP.

## 3. Herramientas disponibles

> **~46 herramientas** en total. Las marcadas con ✦ se añadieron en fases posteriores.

### Proyecto
- **get_project** — Resumen del documento: dimensiones, fps, duración, nº de
  tracks/clips y el árbol con id/tipo/start/duration de cada clip.
- **set_project_settings** — `name?`, `width?`, `height?`, `fps?`,
  `durationInFrames?`, `backgroundColor?`.
- ✦ **new_project** — Reemplaza el documento por un proyecto nuevo y vacío
  (3 pistas). `name?`, `width?`, `height?`, `fps?`, `durationInFrames?`.
- ✦ **set_resolution_preset** — `preset`: `youtube-1080p`, `youtube-1080p60`,
  `youtube-4k`, `shorts` (vertical 1080×1920), `square`.

### Pistas (tracks)
- **list_tracks** — Lista las pistas con su id, tipo, flags y nº de clips.
- **add_track** — `name?`, `kind?` (`media`|`audio`), `index?`. Devuelve el `trackId`.
- **remove_track** — `trackId`.
- **update_track** — `trackId`, `name?`, `muted?`, `hidden?`, `locked?`, `volume?`.

### Añadir clips (todos devuelven el `clipId`)
- **add_text** — `trackId`, `text`, `start`, `duration`, `x?`, `y?`,
  `fontSize?`, `color?`, `fontWeight?`, `textAlign?`, `animationInPreset?`,
  `animationOutPreset?`.
- **add_image** — `trackId`, `src`, `start`, `duration`, `x?`, `y?`, `fit?`.
- **add_video** — `trackId`, `src`, `start`, `duration`, `x?`, `y?`, `volume?`, `fit?`.
- **add_audio** — `trackId`, `src`, `start`, `duration`, `volume?`.
- **add_shape** — `trackId`, `shape` (`rect`|`circle`|`ellipse`|`triangle`|`star`),
  `start`, `duration`, `fill?`, `x?`, `y?`, `width?`, `height?`.
- **add_solid** — `trackId`, `color`, `start`, `duration`.

### Editar clips
- **update_clip** — `clipId`, `patch` (objeto libre: `x`, `y`, `scale`,
  `rotation`, `opacity`, `text`, `color`, `fontSize`, `src`, `volume`, `width`,
  `height`, `fit`, …).
- **remove_clip** — `clipId`.
- **move_clip** — `clipId`, `start`, `trackId?`.
- **duplicate_clip** — `clipId`. Devuelve el nuevo `clipId`.
- **split_clip** — `clipId`, `frame` (frame absoluto). Devuelve el id de la 2ª mitad.

### Animación, keyframes y efectos
- **set_animation** — `clipId`, `in?` `{preset, durationInFrames, easing}`,
  `out?` `{…}`. Presets: `none`, `fade`, `slide-left/right/up/down`,
  `zoom-in/out`, `pop`, `blur`, `wipe-left/right`.
- **add_keyframe** — `clipId`, `property` (`x`|`y`|`scale`|`rotation`|`opacity`|`volume`),
  `frame` (relativo al clip), `value`, `easing?`.
- **remove_keyframe** — `clipId`, `property`, `frame`.
- **add_effect** — `clipId`, `type` (`blur`|`brightness`|`contrast`|`saturate`|
  `grayscale`|`sepia`|`hue-rotate`|`invert`), `value`.
- **remove_effect** — `clipId`, `index`.

### Assets
- **import_asset** — `name`, `kind` (`video`|`image`|`audio`), `src`.
- **list_assets** — lista los assets del proyecto.

### ✦ Consulta / inspección
- **find_clips** — Filtra clips por `type?`, `trackId?`, `fromFrame?`,
  `toFrame?` (solapamiento), `textContains?`. Devuelve los que coinciden.
- **get_clip** — `clipId`. JSON completo del clip.
- **find_gaps** — `trackId`. Huecos (rangos vacíos) de la pista.

### ✦ Edición avanzada
- **set_speed** — `clipId`, `speed` (>1 acelera, <1 ralentiza). Ajusta
  `playbackRate` y la duración en la línea de tiempo.
- **add_transition** — `clipId`, `type` (`crossfade`|`fade`|`fade-black`|
  `slide`|`wipe`|`zoom`), `durationInFrames?`, `direction?`, `applyTo?`
  (`in`|`out`|`both`).
- **color_grade** — `clipId` + `brightness?`, `contrast?`, `saturate?`,
  `grayscale?`, `sepia?`, `hueRotate?`, `invert?`. Reemplaza solo los efectos
  de color indicados.
- **duck_audio** — `clipId`, `fromFrame`, `toFrame`, `level?` (def 0.2),
  `rampFrames?`. Baja la música durante la voz con keyframes de volumen.
- **align_clip** — `clipId`, `horizontal?` (`left`|`center`|`right`),
  `vertical?` (`top`|`center`|`bottom`), `margin?`.

### ✦ Subtítulos
- **add_subtitles** — Pasa `srt` (texto SRT/VTT) **o** `cues`
  (`[{start,end,text}]` en segundos). `preset?` (`youtube`|`tiktok`|`minimal`|
  `bold`), `fontSize?`, `y?`, `trackId?` (crea una pista nueva si falta).

### ✦ Stock y generación de assets
- **search_stock** — `query`, `type?` (`image`|`video`), `provider?`
  (`pexels`|`pixabay`|`all`). Devuelve resultados con `downloadUrl` (requiere
  `PEXELS_API_KEY` / `PIXABAY_API_KEY` en `.env.local`).
- **import_stock** — `url`, `kind`, `name`, `trackId?`, `start?`, `duration?`.
  Descarga el asset y, si das `trackId`, lo coloca en la línea de tiempo.
- **add_generated_media** — `name`, `kind`, `src`, `trackId`, `start?`,
  `duration?`. Registra un asset generado por IA (por URL) y lo añade de una vez.
  Flujo recomendado: genera con el MCP creativo → llama a esta herramienta.

### ✦ Compositing
- **set_blend_mode** — `clipId`, `mode` (mix-blend-mode CSS: normal, multiply, screen,
  overlay, darken, lighten, color-dodge/burn, hard/soft-light, difference, exclusion,
  hue, saturation, color, luminosity).
- **set_crop** — `clipId`, `top?/right?/bottom?/left?` (% 0..100 de cada borde).
- **set_mask** — `clipId`, `mask` (none|circle|ellipse|rounded).
- **make_pip** — `clipId`, `corner` (top-left|top-right|bottom-left|bottom-right),
  `scale?` (0.05..1, def 0.3), `margin?`. Picture-in-picture en una esquina.

### ✦ Historial
- **undo** — deshace el último cambio. **redo** — lo rehace. (También Ctrl+Z / Ctrl+Shift+Z
  en la app y botones en la barra superior.)

### Render
- **render_video** — lanza el render. Devuelve `jobId`.
- **render_status** — `jobId`. Devuelve `status`, `progress` (0..1) y `url` del
  MP4 cuando está listo (p.ej. `/renders/<id>.mp4`).

## Notas

- **Coordenadas**: `x`/`y` son offset en px desde el **centro** del lienzo
  (`0,0` = centrado).
- **Tiempos**: en **frames**. Segundos = frames / `fps` del proyecto.
- **Capas**: `tracks[0]` es la capa de abajo; la última pista se dibuja encima.
- **Variable de entorno**: `CUTGENT_URL` (por defecto `http://localhost:3000`)
  apunta al servidor Next.
