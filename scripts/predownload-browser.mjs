// Pre-descarga Chrome Headless Shell ANTES de empaquetar, para que el render
// funcione OFFLINE desde el primer uso (sin esto, el primer export en la
// máquina del cliente intenta bajar ~150MB y crashea sin internet).
// Remotion lo guarda en node_modules/.remotion (relativo al cwd = raíz del
// repo); electron-builder lo incluye en el instalador y, como la app fija
// cwd=appDir, Remotion lo encuentra ahí en tiempo de ejecución.
import { ensureBrowser } from "@remotion/renderer";

console.log("[predownload] Descargando Chrome Headless Shell (render offline)…");
await ensureBrowser();
console.log("[predownload] Chrome listo en node_modules/.remotion → se incluye en el build.");
