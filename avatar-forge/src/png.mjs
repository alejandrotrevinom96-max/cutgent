// Dependency-free PNG tint codec (built on Node's zlib). This is the headless
// technological ceiling for recolor: real VRM bases bake hair/skin/eye color into
// PNG texture atlases, so to recolor them we must decode -> tint -> re-encode the
// actual pixels. Supports 8-bit RGB (colorType 2) and RGBA (colorType 6) — the
// formats VRM textures actually use. Beyond this (procedural/AI texture synthesis)
// you need a GPU/engine; that's the wall.
import zlib from "node:zlib";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ---- CRC32 (PNG polynomial) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

export function isPng(buf) { return Buffer.isBuffer(buf) && buf.length >= 8 && buf.subarray(0, 8).equals(SIG); }

export function decodePng(buf) {
  if (!isPng(buf)) throw new Error("not a PNG");
  let off = 8, ihdr = null; const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9] };
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error("PNG has no IHDR");
  const bpp = ihdr.colorType === 6 ? 4 : ihdr.colorType === 2 ? 3 : 0;
  if (ihdr.bitDepth !== 8 || !bpp) throw new Error(`unsupported PNG (bitDepth ${ihdr.bitDepth}, colorType ${ihdr.colorType}); only 8-bit RGB/RGBA`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width, height } = ihdr, stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++]; const base = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[base + x - bpp] : 0;
      const b = y > 0 ? out[base - stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[base - stride + x - bpp] : 0;
      let v = raw[pos++];
      if (ft === 1) v = (v + a) & 255; else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255; else if (ft === 4) v = (v + paeth(a, b, c)) & 255;
      out[base + x] = v;
    }
  }
  return { width, height, bpp, colorType: ihdr.colorType, pixels: out };
}

export function encodePng({ width, height, bpp, colorType, pixels }) {
  const stride = width * bpp;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) { raw[y * (stride + 1)] = 0; pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function hexToRgb01(hex) {
  const h = String(hex).replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Multiplicative tint, blended by strength: out = src * ((1-s) + s*tint). Recolors
// a light/gray texture toward the target hue while preserving shading detail.
export function tintPixels(img, hex, strength = 1) {
  const [tr, tg, tb] = hexToRgb01(hex);
  const f = [tr, tg, tb];
  const { pixels, bpp } = img;
  for (let i = 0; i < pixels.length; i += bpp) {
    for (let ch = 0; ch < 3 && ch < bpp; ch++) {
      const m = (1 - strength) + strength * f[ch];
      pixels[i + ch] = Math.max(0, Math.min(255, Math.round(pixels[i + ch] * m)));
    }
  }
  return img;
}

export function tintPng(buf, hex, strength = 1) {
  return encodePng(tintPixels(decodePng(buf), hex, strength));
}
