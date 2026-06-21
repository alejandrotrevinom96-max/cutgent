import { isPng, tintPng } from "./png.mjs";

// Recolor a base's BAKED textures: find each material's base-color image, tint
// its pixels, and write it back into the GLB binary — repacking bufferViews so
// the (now differently-sized) image doesn't corrupt the offsets of the geometry
// that shares the same buffer. Works for images stored in the BIN chunk and for
// data-URI images. External-file textures are reported as skipped.

// Repack the BIN: re-serialize every bufferView (4-byte aligned), substituting
// the buffers in `replacements` (Map<bufferViewIndex, Buffer>) and fixing every
// view's byteOffset/byteLength. Untouched views keep their exact bytes.
export function repackBin(json, bin, replacements) {
  const views = json.bufferViews || [];
  const parts = [];
  let offset = 0;
  views.forEach((bv, i) => {
    let data = replacements.has(i)
      ? Buffer.from(replacements.get(i))
      : Buffer.from((bin || Buffer.alloc(0)).subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad, 0)); offset += pad; }
    bv.buffer = 0; bv.byteOffset = offset; bv.byteLength = data.length;
    parts.push(data); offset += data.length;
  });
  const newBin = Buffer.concat(parts);
  if (json.buffers && json.buffers[0]) json.buffers[0].byteLength = newBin.length;
  return newBin;
}

export function tintTextures(json, bin, palette, strength = 1) {
  const applied = [], warnings = [];
  const mats = json.materials || [], textures = json.textures || [], images = json.images || [];
  const imageToHex = new Map();
  for (const m of mats) {
    const name = (m.name || "").toLowerCase();
    const bct = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture;
    if (!bct || bct.index == null) continue;
    for (const [key, hex] of Object.entries(palette)) {
      if (!name.includes(key.toLowerCase())) continue;
      const src = textures[bct.index] && textures[bct.index].source;
      if (src != null && !imageToHex.has(src)) imageToHex.set(src, { hex, mat: m.name || "mat", key });
    }
  }
  if (imageToHex.size === 0) return { bin, applied, warnings };

  const replacements = new Map();
  for (const [imgIdx, { hex, mat, key }] of imageToHex) {
    const img = images[imgIdx];
    if (!img) continue;
    if (img.bufferView != null && bin) {
      const bv = json.bufferViews[img.bufferView];
      const bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
      if (!isPng(bytes)) { warnings.push(`${mat}: base texture not PNG, skipped`); continue; }
      try { replacements.set(img.bufferView, tintPng(Buffer.from(bytes), hex, strength)); applied.push(`tex ${mat}<-${key}:${hex}`); }
      catch (e) { warnings.push(`${mat}: ${e.message}`); }
    } else if (img.uri && img.uri.startsWith("data:")) {
      const bytes = Buffer.from((img.uri.split(",")[1] || ""), "base64");
      if (!isPng(bytes)) { warnings.push(`${mat}: data-uri texture not PNG, skipped`); continue; }
      try { img.uri = "data:image/png;base64," + tintPng(bytes, hex, strength).toString("base64"); applied.push(`tex ${mat}<-${key}:${hex}`); }
      catch (e) { warnings.push(`${mat}: ${e.message}`); }
    } else {
      warnings.push(`${mat}: external/unsupported texture, skipped`);
    }
  }
  const newBin = replacements.size ? repackBin(json, bin, replacements) : bin;
  return { bin: newBin, applied, warnings };
}
