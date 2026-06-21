import { readGlb, writeGlb } from "./glb.mjs";
import { detectSpec } from "./vrm.mjs";

// EXPERIMENTAL, dependency-free facial rig generator. Given a VRM BODY base (no
// face morphs), it reads the head mesh vertices, locates face regions by geometric
// heuristics (no ML landmarks), synthesizes morph targets (blink / mouth open-wide-
// pucker / smile-frown / brows), writes them as glTF morph targets, and binds them
// to the VRM expression presets. The PLUMBING is exact and gated; the DEFORMATION
// PLACEMENT is heuristic — quality depends on the mesh and should be eyeballed in a
// viewer (we can't render headless). Front-facing axis is a knob (meshes vary).

// base morph -> the region + per-vertex displacement it applies
const f32 = (arr) => { const b = Buffer.alloc(arr.length * 4); for (let i = 0; i < arr.length; i++) b.writeFloatLE(arr[i], i * 4); return b; };
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

// classify head vertices into regions (normalized within the head bbox)
function regions(pos, count, front) {
  let minY = Infinity, maxY = -Infinity, maxAbsZ = 0, maxAbsX = 0;
  for (let i = 0; i < count; i++) { const y = pos[i * 3 + 1], z = pos[i * 3 + 2], x = pos[i * 3]; if (y < minY) minY = y; if (y > maxY) maxY = y; if (Math.abs(z) > maxAbsZ) maxAbsZ = Math.abs(z); if (Math.abs(x) > maxAbsX) maxAbsX = Math.abs(x); }
  const headMinY = minY + 0.80 * (maxY - minY), headH = maxY - headMinY || 1;
  const zSign = front === "-z" ? -1 : 1;
  const out = { mouth: [], eyeL: [], eyeR: [], browL: [], browR: [], headTop: maxY, headH };
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (y < headMinY) continue;
    const hy = (y - headMinY) / headH;
    const frontish = zSign * z > 0.20 * maxAbsZ;
    if (!frontish) continue;
    const nx = x / (maxAbsX || 1);
    if (hy >= 0.08 && hy <= 0.38 && Math.abs(nx) < 0.45) out.mouth.push(i);
    else if (hy >= 0.45 && hy <= 0.70) { if (nx > 0.06 && nx < 0.55) out.eyeL.push(i); else if (nx < -0.06 && nx > -0.55) out.eyeR.push(i); }
    else if (hy > 0.68 && hy <= 0.82) { if (nx > 0.04 && nx < 0.6) out.browL.push(i); else if (nx < -0.04 && nx > -0.6) out.browR.push(i); }
  }
  return out;
}

// build a delta array (count*3) from a region + a per-vertex displacement fn(x,y,z,i)->[dx,dy,dz]
function morph(count, idxs, pos, fn) {
  const d = new Float32Array(count * 3);
  for (const i of idxs) { const [dx, dy, dz] = fn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); d[i * 3] = dx; d[i * 3 + 1] = dy; d[i * 3 + 2] = dz; }
  return d;
}

export function riggFace(vrmBuffer, opts = {}) {
  const front = opts.front || "+z";
  const { json, bin, version } = readGlb(vrmBuffer);
  if (detectSpec(json) !== "1.0") throw new Error("riggFace expects a VRM 1.0 body base (run import_glb first)");
  if (!bin) throw new Error("VRM has no geometry (BIN)");
  const { meshNode, meshIndex, prim, count, pos } = readPositions(json, bin);
  const r = regions(pos, count, front);
  const sc = (r.headH || 0.2);               // displacement scale tied to head size
  const zf = front === "-z" ? -1 : 1;

  // base morph targets (deltas)
  const targets = [
    ["mouthOpen", morph(count, r.mouth, pos, (x, y) => [0, -0.10 * sc, 0])],
    ["mouthWide", morph(count, r.mouth, pos, (x) => [Math.sign(x) * 0.05 * sc, 0, 0])],
    ["mouthPucker", morph(count, r.mouth, pos, (x) => [-x * 0.3, 0, zf * 0.04 * sc])],
    ["smile", morph(count, r.mouth, pos, (x) => [0, Math.abs(x) > 0.02 ? 0.06 * sc : 0, 0])],
    ["frown", morph(count, r.mouth, pos, (x) => [0, Math.abs(x) > 0.02 ? -0.06 * sc : 0, 0])],
    ["eyeClose", morph(count, [...r.eyeL, ...r.eyeR], pos, () => [0, -0.06 * sc, 0])],
    ["browUp", morph(count, [...r.browL, ...r.browR], pos, () => [0, 0.05 * sc, 0])],
    ["browDown", morph(count, [...r.browL, ...r.browR], pos, () => [0, -0.05 * sc, 0])],
  ];

  // append morph accessors/bufferViews to the BIN
  const chunks = [Buffer.from(bin)]; let off = bin.length;
  prim.targets = prim.targets || [];
  const mesh = json.meshes[meshIndex]; mesh.weights = mesh.weights || [];
  const tIndex = {};
  for (const [name, delta] of targets) {
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

  // bind expression presets to the morph targets
  const B = (binds) => ({ morphTargetBinds: binds.map(([n, w]) => ({ node: meshNode, index: tIndex[n], weight: w })), materialColorBinds: [], textureTransformBinds: [], isBinary: false, overrideBlink: "none", overrideLookAt: "none", overrideMouth: "none" });
  const preset = json.extensions.VRMC_vrm.expressions.preset = json.extensions.VRMC_vrm.expressions.preset || {};
  preset.happy = B([["smile", 1]]);
  preset.sad = B([["frown", 1]]);
  preset.angry = B([["browDown", 1], ["frown", 0.5]]);
  preset.relaxed = B([["smile", 0.4]]);
  preset.surprised = B([["mouthOpen", 0.7], ["browUp", 1]]);
  preset.neutral = B([]);
  preset.aa = B([["mouthOpen", 1]]);
  preset.ih = B([["mouthWide", 1]]);
  preset.ou = B([["mouthPucker", 1]]);
  preset.ee = B([["mouthWide", 0.8]]);
  preset.oh = B([["mouthOpen", 0.6], ["mouthPucker", 0.5]]);
  preset.blink = { ...B([["eyeClose", 1]]), isBinary: true };

  json.buffers[0].byteLength = Buffer.concat(chunks).length;
  const report = {
    verts: count, front,
    regions: { mouth: r.mouth.length, eyes: r.eyeL.length + r.eyeR.length, brows: r.browL.length + r.browR.length },
    morphsAdded: targets.length,
    quality: "EXPERIMENTAL/heuristic — eyeball in a viewer; flip `front` if the face is on the other side",
    warnings: r.mouth.length === 0 ? ["no mouth vertices found — wrong front axis or unusual mesh"] : [],
  };
  return { buffer: writeGlb({ json, bin: Buffer.concat(chunks), version }), report, tIndex };
}
