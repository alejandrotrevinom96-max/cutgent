// Preload mínimo. La app es una web app local; no expone APIs nativas por ahora.
// Punto de extensión futuro (p.ej. diálogos nativos de archivo) vía contextBridge.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cutgent", {
  desktop: true,
  platform: process.platform,
  /** Abre el preview en una ventana aparte (2º monitor). */
  openPreviewWindow: () => ipcRenderer.invoke("cutgent:open-preview"),
  /** Auto-conecta la config MCP en los clientes de IA instalados. Devuelve
   *  [{client, status, file, error?}]. Solo disponible en la app de escritorio. */
  connectClients: () => ipcRenderer.invoke("cutgent:connect-clients"),
});
