# Third-Party Notices

Cutgent incluye o depende de componentes de terceros, cada uno bajo su propia
licencia. Esta lista es informativa (no exhaustiva); las licencias completas
viven en `node_modules/<paquete>/LICENSE`.

| Componente | Uso en Cutgent | Licencia | Nota |
|---|---|---|---|
| **Remotion** (`remotion`, `@remotion/*`) | Render de video y preview | Remotion License (company license) | Gratis para individuos / equipos pequeños; puede requerir **licencia comercial de pago** según tamaño del equipo y uso. Ver https://remotion.dev/license |
| **FFmpeg** (`ffmpeg-static`) | Audio/VFX (normalize, loudness, chroma, denoise, etc.) | LGPL/GPL (según build) | Si se distribuye un build GPL de FFmpeg, aplica el copyleft de GPL al binario de FFmpeg. Ver https://ffmpeg.org/legal.html |
| **Whisper** (modelos) / `@huggingface/transformers` | Transcripción y subtítulos locales | Apache-2.0 (modelo Whisper: MIT) | Pesos descargados/empaquetados aparte |
| **Next.js** (`next`) | Framework de la app | MIT | |
| **React / React-DOM** | UI | MIT | |
| **Electron** | Empaquetado de escritorio | MIT | Chromium/Node bajo sus propias licencias |
| **electron-updater** | Auto-actualización | MIT | |
| **Zustand, Zod, clsx, nanoid, lucide-react, tailwindcss** | Utilidades / UI | MIT | |

> Nota legal pendiente (decisión del propietario): si Cutgent se distribuye
> comercialmente, revisar (1) licencia comercial de Remotion y (2) el aviso/
> cumplimiento de GPL/LGPL de FFmpeg. El propietario decidió avanzar ahora y
> resolver el licenciamiento de pago si/cuando se requiera.
