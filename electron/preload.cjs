// Preload mínimo. La app es una web app local; no expone APIs nativas por ahora.
// Punto de extensión futuro (p.ej. diálogos nativos de archivo) vía contextBridge.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cutgent", {
  desktop: true,
  platform: process.platform,
  /** Abre el preview en una ventana aparte (2º monitor). */
  openPreviewWindow: () => ipcRenderer.invoke("cutgent:open-preview"),
});
