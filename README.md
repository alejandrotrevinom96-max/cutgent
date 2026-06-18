# Claudit 🎬

Editor de video **full-stack** basado en [Remotion](https://www.remotion.dev/), diseñado para ser **100% controlable por Claude vía MCP**. El video entero es un documento JSON; tú lo editas en una UI tipo Premiere/CapCut, y Claude lo edita por comandos a través de un servidor MCP — ambos sobre la misma fuente de verdad, sincronizados en vivo.

## Arquitectura

```
                        ┌─────────────────────────────┐
   Editor (navegador)   │   Next.js (App Router)       │   Servidor MCP
   ─ UI React/Remotion  │                             │   (Node + tsx)
   ─ Zustand store  ───► │  POST /api/document/command ◄─── herramientas: add_clip,
   ─ <Player> preview    │  GET  /api/document         │     add_text, animate, render…
        ▲                │  GET  /api/document/stream  │           ▲
        │   SSE en vivo  │  POST /api/render (MP4)     │           │
        └────────────────┤  data/project.json (verdad) ├───────────┘
                         └─────────────────────────────┘
```

- **Un documento JSON** (`src/lib/schema.ts`) describe todo: proyecto, pistas, clips (video/imagen/audio/texto/forma/sólido), animaciones, keyframes, efectos.
- **Comandos** (`src/lib/commands.ts`) son la única forma de mutarlo. `applyCommand` es un reducer puro usado por la UI, la API y el MCP.
- **El servidor** guarda el documento autoritativo, lo persiste en `data/project.json` y lo transmite por **SSE**, así el editor abierto refleja en vivo lo que cambia Claude.
- **Remotion** renderiza el mismo documento tanto en el preview (`@remotion/player`) como en el export a MP4 (`@remotion/renderer`), así que lo que ves es lo que se exporta.

## Puesta en marcha

```bash
npm install
npm run dev            # http://localhost:3000
```

### Conectar Claude (MCP)

Con la app corriendo, registra el servidor MCP (ver `mcp-server/README.md`). El repo incluye un `.mcp.json` listo para Claude Code:

```jsonc
{ "mcpServers": { "claudit": {
  "command": "npx", "args": ["tsx", "mcp-server/index.ts"],
  "env": { "CLAUDIT_URL": "http://localhost:3000" }
}}}
```

Luego pídele a Claude cosas como *"añade un título con animación pop, un fondo degradado y música, y exporta a MP4"* — verás los cambios aparecer en el editor en tiempo real.

## Funcionalidades

- Línea de tiempo multipista con drag, resize, zoom, playhead.
- Clips: **video, imagen, audio, texto, formas y fondos sólidos**.
- Animaciones de entrada/salida (fade, slide, zoom, pop, blur, wipe), **keyframes** por propiedad con easing, y **efectos** (blur, brillo, contraste, saturación, grayscale, sepia, hue-rotate, invert).
- Inspector completo de propiedades por tipo de clip.
- Biblioteca de medios: subir archivos o importar por URL (incluye medios generados por IA).
- **Export a MP4** real con barra de progreso.
- **Control total por MCP**: ~30 herramientas que cubren cada acción del editor.

## Estructura

```
src/
  app/                 # Next.js: página del editor + rutas API
    api/document/      # documento + comandos + stream SSE
    api/render/        # export a MP4 (Remotion renderer)
    api/assets/        # biblioteca de medios
  lib/                 # schema, comandos, store, factory, stores de servidor
  remotion/            # composición Remotion + motor de animación
  components/          # UI: timeline, inspector, media, preview, topbar
mcp-server/            # servidor MCP (control por Claude)
```

## Notas

- El **primer export** descarga Chromium headless (puede tardar); los siguientes son rápidos.
- Pensado para correr en local; el documento vive en `data/project.json`.
