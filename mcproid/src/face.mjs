import { readGlb, writeGlb } from "./glb.mjs";
import { detectSpec } from "./vrm.mjs";

// MCProid facial-rig ENGINE (v2) — "be like VRoid" as far as a headless tool can.
// VRoid gets quality because it OWNS the topology (it knows which vertex is the
// mouth). On an arbitrary mesh we don't, so we ESTIMATE anatomy and deform smoothly:
//   1) find the nose tip = the most protruding head vertex (robust face anchor),
//   2) derive mouth / eye / brow anchors from it,
//   3) apply FACS-style action units with a GAUSSIAN FALLOFF around each anchor
//      (smooth, concentrated deformation — no hard region edges / blobs),
//   4) compose the action units into the 12 VRM expression presets, symmetric.
// The morph plumbing is exact + gated; placement is estimated (eyeball it).

const f32 = (a) => { const b = Buffer.alloc(a.length * 4); for (let i = 0; i < a.length; i++) b.writeFloatLE(a[i], i * 4); return b; };
const pad4 = (n) => (4 - (n % 4)) % 4;

function readPositions(json, bin) {
  const meshNode = (json.nodes || []).findIndex((n) => n.mesh != null);
  if (meshNode < 0) throw new Error("no mesh node");
  const prim = json.meshes[json.nodes[meshNode].mesh].primitives[0];
  const acc = json.accessors[prim.attributes.POSITION];
  const bv = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const pos = new Float32Array(acc.count * 3);
  for (let i = 0; i < acc.count * 3; i++) pos[i] = bin.readFloatLE(base + i * 4);
  return { meshNode, meshIndex: json.nodes[meshNode].mesh, prim, count: acc.count, pos };
}

// Estimate face anchors from geometry. Front axis chosen by max protrusion.
function anchors(pos, count, frontOpt) {
  let minY = Infinity, maxY = -Infinity, maxAbsX = 0;
  for (let i = 0; i < count; i++) { const y = pos[i * 3 + 1], x = Math.abs(pos[i * 3]); if (y < minY) minY = y; if (y > maxY) maxY = y; if (x > maxAbsX) maxAbsX = x; }
  const headMinY = minY + 0.80 * (maxY - minY), headH = (maxY - headMinY) || 1, headW = maxAbsX || 1;
  // nose tip per candidate front: most protruding head vertex near center X, mid-head
  const noseFor = (zf) => {
    let best = null, bestZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const y = pos[i * 3 + 1]; if (y < headMinY) continue;
      const x = pos[i * 3], z = zf * pos[i * 3 + 2];
      if (Math.abs(x) > 0.18 * headW) continue;
      const hy = (y - headMinY) / headH; if (hy < 0.25 || hy > 0.75) continue;
      if (z > bestZ) { bestZ = z; best = [x, y, pos[i * 3 + 2]]; }
    }
    return { nose: best, protr: bestZ };
  };
  let front = frontOpt;
  if (front !== "+z" && front !== "-z") { front = noseFor(1).protr >= noseFor(-1).protr ? "+z" : "-z"; }
  const zf = front === "-z" ? -1 : 1;
  const nose = noseFor(zf).nose || [0, headMinY + 0.5 * headH, zf * headW];
  const [nx, ny, nz] = nose;
  return {
    front, zf, headH, headW,
    mouth: [nx, ny - 0.16 * headH, nz * 0.92],
    eyeL: [nx + 0.42 * headW, ny + 0.10 * headH, nz * 0.82],
    eyeR: [nx - 0.42 * headW, ny + 0.10 * headH, nz * 0.82],
    browL: [nx + 0.42 * headW, ny + 0.22 * headH, nz * 0.80],
    browR: [nx - 0.42 * headW, ny + 0.22 * headH, nz * 0.80],
    headMinY,
  };
}

const w2 = (px, py, pz, a, r) => { const dx = px - a[0], dy = py - a[1], dz = pz - a[2]; return Math.exp(-(dx * dx + dy * dy + dz * dz) / (r * r)); };

// Build a delta field (count*3) by visiting head verts and accumulating a fn.
function field(pos, count, headMinY, fn) {
  const d = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = pos[i * 3 + 1]; if (y < headMinY) continue;
    const x = pos[i * 3], z = pos[i * 3 + 2];
    const out = fn(x, y, z); if (!out) continue;
    d[i * 3] += out[0]; d[i * 3 + 1] += out[1]; d[i * 3 + 2] += out[2];
  }
  return d;
}

export function riggFace(vrmBuffer, opts = {}) {
  const { json, bin, version } = readGlb(vrmBuffer);
  if (detectSpec(json) !== "1.0") throw new Error("riggFace expects a VRM 1.0 body base (run import_glb first)");
  if (!bin) throw new Error("VRM has no geometry (BIN)");
  const { meshNode, meshIndex, prim, count, pos } = readPositions(json, bin);
  const A = anchors(pos, count, opts.front);
  const h = A.headH, hm = A.headMinY, zf = A.zf;
  const Rm = 0.16 * h, Re = 0.10 * h, Rb = 0.10 * h;      // falloff radii
  const m = (s) => s * h;                                  // magnitude scaled to head

  // FACS-ish action units, each a smooth falloff field around its anchor(s)
  const AU = {
    jawOpen: field(pos, count, hm, (x, y, z) => { const ww = w2(x, y, z, A.mouth, Rm); const below = Math.max(0, (A.mouth[1] - y) / Rm) + 0.6; return ww > 0.02 ? [0, -m(0.13) * ww * below, -zf * m(0.03) * ww] : null; }),
    lipStretch: field(pos, count, hm, (x, y, z) => { const ww = w2(x, y, z, A.mouth, Rm); return ww > 0.02 ? [Math.sign(x - A.mouth[0]) * m(0.06) * ww, 0, 0] : null; }),
    lipPucker: field(pos, count, hm, (x, y, z) => { const ww = w2(x, y, z, A.mouth, Rm); return ww > 0.02 ? [-(x - A.mouth[0]) * 0.5 * ww, 0, zf * m(0.05) * ww] : null; }),
    smile: field(pos, count, hm, (x, y, z) => { const ww = w2(x, y, z, A.mouth, Rm * 1.1); const corner = Math.min(1, Math.abs(x - A.mouth[0]) / (0.5 * Rm)); return ww > 0.02 ? [0, m(0.07) * ww * corner, 0] : null; }),
    frown: field(pos, count, hm, (x, y, z) => { const ww = w2(x, y, z, A.mouth, Rm * 1.1); const corner = Math.min(1, Math.abs(x - A.mouth[0]) / (0.5 * Rm)); return ww > 0.02 ? [0, -m(0.06) * ww * corner, 0] : null; }),
    blink: field(pos, count, hm, (x, y, z) => { const ww = Math.max(w2(x, y, z, A.eyeL, Re), w2(x, y, z, A.eyeR, Re)); const upper = y > Math.max(A.eyeL[1], A.eyeR[1]) - 0.2 * Re ? 1 : 0.25; return ww > 0.03 ? [0, -m(0.05) * ww * upper, 0] : null; }),
    browUp: field(pos, count, hm, (x, y, z) => { const ww = Math.max(w2(x, y, z, A.browL, Rb), w2(x, y, z, A.browR, Rb)); return ww > 0.03 ? [0, m(0.05) * ww, 0] : null; }),
    browDown: field(pos, count, hm, (x, y, z) => { const ww = Math.max(w2(x, y, z, A.browL, Rb), w2(x, y, z, A.browR, Rb)); return ww > 0.03 ? [0, -m(0.05) * ww, 0] : null; }),
  };

  // append morph targets
  const order = ["jawOpen", "lipStretch", "lipPucker", "smile", "frown", "blink", "browUp", "browDown"];
  const chunks = [Buffer.from(bin)]; let off = bin.length;
  prim.targets = prim.targets || [];
  const mesh = json.meshes[meshIndex]; mesh.weights = mesh.weights || [];
  const tIndex = {};
  for (const name of order) {
    const delta = AU[name];
    const p = pad4(off); if (p) { chunks.push(Buffer.alloc(p, 0)); off += p; }
    const buf = f32(delta);
    const bvIdx = json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length }) - 1;
    chunks.push(buf); off += buf.length;
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < delta.length; i += 3) for (let k = 0; k < 3; k++) { const v = delta[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    const accIdx = json.accessors.push({ bufferView: bvIdx, componentType: 5126, count, type: "VEC3", min: mn, max: mx }) - 1;
    prim.targets.push({ POSITION: accIdx }); mesh.weights.push(0);
    tIndex[name] = prim.targets.length - 1;
  }

  // compose VRM expressions from action units
  const B = (binds) => ({ morphTargetBinds: binds.map(([n, ww]) => ({ node: meshNode, index: tIndex[n], weight: ww })), materialColorBinds: [], textureTransformBinds: [], isBinary: false, overrideBlink: "none", overrideLookAt: "none", overrideMouth: "none" });
  const preset = (json.extensions.VRMC_vrm.expressions.preset = json.extensions.VRMC_vrm.expressions.preset || {});
  preset.happy = B([["smile", 1]]);
  preset.sad = B([["frown", 1], ["browUp", 0.3]]);
  preset.angry = B([["browDown", 1], ["frown", 0.4]]);
  preset.relaxed = B([["smile", 0.4]]);
  preset.surprised = B([["jawOpen", 0.6], ["browUp", 1]]);
  preset.neutral = B([]);
  preset.aa = B([["jawOpen", 1]]);
  preset.ih = B([["lipStretch", 1]]);
  preset.ou = B([["lipPucker", 1]]);
  preset.ee = B([["lipStretch", 0.8], ["jawOpen", 0.15]]);
  preset.oh = B([["jawOpen", 0.5], ["lipPucker", 0.5]]);
  preset.blink = { ...B([["blink", 1]]), isBinary: true };

  const newBin = Buffer.concat(chunks);
  json.buffers[0].byteLength = newBin.length;
  const report = {
    verts: count, front: A.front, noseTip: A.mouth && [+(A.mouth[0]).toFixed(3), +(A.mouth[1] + 0.16 * h).toFixed(3)],
    falloffRadii: { mouth: +Rm.toFixed(3), eye: +Re.toFixed(3), brow: +Rb.toFixed(3) },
    actionUnits: order.length, expressions: 12,
    method: "v2: nose-anchored, Gaussian falloff, FACS action units, symmetric",
    quality: "PROCEDURAL — best-effort headless; not true topology-aware VRoid. Eyeball it; flip --front if the face is on the other side.",
  };
  return { buffer: writeGlb({ json, bin: newBin, version }), report, tIndex };
}
