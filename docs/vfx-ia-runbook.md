# VFX por IA — runbook de validación (BYO-key)

Cómo probar las features de VFX por IA que viven en el editor: **tracking** (seguir
un objeto → keyframes) y **matte / recorte de sujeto** (rotoscopía → `alphaMatte`).
Todo es **BYO-key**: la inferencia la paga tu cuenta del proveedor; Cutgent no toca ese dinero.

Hay dos niveles: **(A) prueba con MOCK sin key** (verifica el pipeline) y **(B) smoke real con key**.

---

## A) Prueba con MOCK (sin key, sin créditos)

Confirma que todo el flujo (job → resultado → escritura en el documento → render) funciona,
usando un proveedor falso determinista.

### Tracking (mock) — listo para probar ya
1. Arranca el editor con la variable de entorno:
   ```
   CUTGENT_TRACK_PROVIDER=mock
   ```
   (PowerShell: `$env:CUTGENT_TRACK_PROVIDER='mock'; npm run dev`)
2. Crea/abre un proyecto con un clip de video y, vía MCP: `track_object({ clipId })`.
3. Consulta `vfx_status({ jobId })` hasta `status: "done"`.
4. **Esperado:** el clip queda con keyframes de `x/y/scale/opacity` (trayectoria diagonal
   del mock) y al reproducir el clip "se mueve". Confirma que `postedProps` lista las propiedades.

### Matte (mock) — requiere 1 fixture
El mock apunta a `/assets/matte_test.webm`, que **hay que crear una vez** (un WebM con canal
alfa de prueba). Genéralo con el ffmpeg del repo o pídemelo y lo dejo en `public/assets/`:
```
ffmpeg -f lavfi -i "color=c=white:s=640x360:r=30:d=2,format=yuva420p" \
  -vf "geq=a='if(lt(hypot(X-W/2,Y-H/2),120),255,0)':r='255':g='255':b='255'" \
  -c:v libvpx-vp9 -pix_fmt yuva420p public/assets/matte_test.webm
```
1. Arranca con `CUTGENT_MATTE_PROVIDER=mock`.
2. `matte_subject({ clipId })` → `vfx_status` hasta `done`.
3. **Esperado:** el clip queda con `alphaMatte.src = /assets/matte_test.webm` y se renderiza
   recortado por la forma del fixture. El `src` original se conserva (quitar `alphaMatte` revierte).

> Si el render del matte NO recorta (mask vacío o sin animación), es la señal del riesgo
> conocido del Camino A; nosotros usamos Camino B (swap al WebM-alfa vía `transparent`),
> que reusa un path ya probado en producción.

---

## B) Smoke real (con key) — lo único que falta validar

Las keys se ponen en **Cutgent → Ajustes** (o como env var; `getKey` lee Ajustes primero, luego env).

### Tracking real (SAM2 vía Replicate)
1. `REPLICATE_API_TOKEN` en Ajustes.
2. **Pinear el modelo** (hoy el default es un placeholder `meta/sam-2-video:PINME`):
   pon el `versionHash` real con `CUTGENT_SAM2_MODEL=owner/name:HASH` (o pásalo en `track_object({model})`).
3. **URL pública del media:** Replicate descarga el video desde una URL accesible. En dev,
   `http://localhost:3000` no le sirve → usa un túnel (cloudflared/ngrok) y `CUTGENT_PUBLIC_URL=<url-túnel>`.
   En la app empaquetada, define `CUTGENT_PUBLIC_URL`.
4. `track_object({ clipId })` → `vfx_status`. **A validar:** el formato exacto de salida de SAM2
   (bbox-JSON vs máscara). Está aislado en `parseOutput` de `src/lib/tracking/providers/replicate-sam2.ts`;
   si el formato difiere, se ajusta SOLO ahí (el resto del pipeline ya está verde).

### Matte real (fal VEED background removal)
1. `FAL_KEY` en Ajustes.
2. (Opcional) `CUTGENT_MATTE_MODEL=veed/video-background-removal` (default) o la variante que prefieras.
3. `matte_subject({ clipId })` → `vfx_status`. **A validar:** (a) la forma de respuesta de fal
   (aislada en `parseOutput` de `src/lib/matting/providers/fal-veed.ts`) y (b) que el WebM venga
   con **canal alfa** (`ffprobe` debe mostrar `yuva420p`). Sin alfa, el recorte no se ve.

---

## Resumen de variables

| Variable | Para qué | Dónde |
|---|---|---|
| `REPLICATE_API_TOKEN` | tracking SAM2 | Ajustes (BYO-key) |
| `FAL_KEY` | matte VEED | Ajustes (BYO-key) |
| `CUTGENT_TRACK_PROVIDER` | `mock` para probar sin key | env |
| `CUTGENT_MATTE_PROVIDER` | `mock` para probar sin key | env |
| `CUTGENT_SAM2_MODEL` | pin `owner/name:hash` de SAM2 | env / arg |
| `CUTGENT_MATTE_MODEL` | modelo de matte en fal | env / arg |
| `CUTGENT_PUBLIC_URL` | URL pública del media para el proveedor | env |

Lo verificado sin key (commits de la sesión): el comando `set_track_keyframes`, RDP, el mapeo
bbox→keyframes, el schema `alphaMatte`, `update_effect`, y los `parseOutput` puros. Lo único
pendiente es este smoke real con tus keys.
