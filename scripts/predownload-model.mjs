// Pre-descarga el modelo de Whisper a ./models para INCLUIRLO en el instalador
// (el usuario eligió "modelo incluido" → la app funciona offline desde el
// primer uso). electron-builder copia ./models → resources/models, y la app lo
// copia a la carpeta del usuario en el primer arranque.
import path from "path";
import { env, pipeline } from "@huggingface/transformers";

env.cacheDir = path.join(process.cwd(), "models");
env.allowLocalModels = true;

const model = process.env.CUTGENT_DICTATION_MODEL || "Xenova/whisper-base";
console.log(`[predownload] Descargando ${model} → ${env.cacheDir} …`);
await pipeline("automatic-speech-recognition", model, { dtype: "q8" });
console.log("[predownload] Modelo listo. Ya se puede empaquetar (npm run dist:win).");
