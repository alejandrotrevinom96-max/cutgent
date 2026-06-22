import { readGlb, writeGlb } from "./glb.mjs";
import { detectSpec, VRM0_TO_NEUTRAL } from "./vrm.mjs";
import { REQUIRED_EXPRESSIONS } from "./contract.mjs";

// Deformation transfer (the "moat"): copy a donor VRM's ARTIST-QUALITY expression/
// viseme blendshapes onto a target mesh of DIFFERENT topology — pure Node, headless.
// Reads donors in BOTH VRM 0.x (extensions.VRM.blendShapeMaster, weights 0-100,
// multi-mesh) and VRM 1.0 (VRMC_vrm expressions, morphTargetBinds). Method: gather
// the donor's per-vertex delta field per expression across all involved meshes,
// align donor head -> target head (centroid+radius), spatial-hash kNN, inverse-
// distance resample onto the target head, write as target morph targets bound to
// the same VRM expression. Uses real deltas, so quality tracks the donor.

const meshInfo = (json) => { const node = json.nodes.findIndex((n) => n.mesh != null); const prim = json.meshes[json.nodes[node].mesh].primitives[0]; return { node, mesh: json.meshes[json.nodes[node].mesh], prim }; };
function readVec3(json, bin, accIdx) {
  const acc = json.accessors[accIdx], bv = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float32Array(acc.count * 3);
  for (let i = 0; i < acc.count * 3; i++) out[i] = bin.readFloatLE(base + i * 4);
  return out;
}
const positions = (json, bin) => { const { prim } = meshInfo(json); return readVec3(json, bin, prim.attributes.POSITION); };

// donor -> { pos: concatenated vertex cloud of all expression-involved meshes,
//           deltas: Map<neutralName, Float32Array|null>, multiMesh: boolean }
function donorField(json, bin) {
  const spec = detectSpec(json);
  const groups = []; // {name, binds:[{meshIndex,targetIndex,weight}]}
  if (spec === "1.0") {
    const preset = (json.extensions.VRMC_vrm.expressions && json.extensions.VRMC_vrm.expressions.preset) || {};
    for (const [name, e] of Object.entries(preset)) groups.push({ name, binds: (e.morphTargetBinds || []).map((b) => ({ meshIndex: json.nodes[b.node].mesh, targetIndex: b.index, weight: b.weight == null ? 1 : b.weight })) });
  } else if (spec === "0.x") {
    const bsg = (json.extensions.VRM.blendShapeMaster && json.extensions.VRM.blendShapeMaster.blendShapeGroups) || [];
    for (const g of bsg) {
      const preset = (g.presetName || "").toLowerCase();
      const name = (preset && preset !== "unknown" && VRM0_TO_NEUTRAL[preset]) || (g.name ? g.name.toLowerCase() : null);
      if (!name || !REQUIRED_EXPRESSIONS.includes(name)) continue;
      groups.push({ name, binds: (g.binds || []).map((b) => ({ meshIndex: b.mesh, targetIndex: b.index, weight: (b.weight == null ? 100 : b.weight) / 100 })) });
    }
  } else throw new Error("donor is not a VRM");

  const meshSet = new Set(); for (const g of groups) for (const b of g.binds) meshSet.add(b.meshIndex);
  const meshList = [...meshSet];
  const meshPos = new Map(); let N = 0;
  for (const mi of meshList) { const prim = json.meshes[mi].primitives[0]; const pos = readVec3(json, bin, prim.attributes.POSITION); meshPos.set(mi, { pos, off: N, prim }); N += pos.length / 3; }
  const cloud = new Float32Array(N * 3);
  for (const mi of meshList) { const { pos, off } = meshPos.get(mi); cloud.set(pos, off * 3); }

  const deltas = new Map();
  for (const g of groups) {
    const d = new Float32Array(N * 3); let any = false;
    for (const b of g.binds) {
      const mp = meshPos.get(b.meshIndex); if (!mp) continue;
      const tgt = mp.prim.targets && mp.prim.targets[b.targetIndex]; if (!tgt) continue;
      const td = readVec3(json, bin, tgt.POSITION);
      for (let i = 0; i < td.length; i++) d[mp.off * 3 + i] += td[i] * b.weight; any = true;
    }
    if (any && (!deltas.has(g.name) || !deltas.get(g.name))) deltas.set(g.name, d);
    else if (!deltas.has(g.name)) deltas.set(g.name, any ? d : null);
  }
  return { pos: cloud, deltas, count: N, multiMesh: meshList.length > 1 };
}

function headIdx(pos, count) {
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < count; i++) { const y = pos[i * 3 + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const thr = minY + 0.80 * (maxY - minY), idx = [];
  for (let i = 0; i < count; i++) if (pos[i * 3 + 1] >= thr) idx.push(i);
  return idx;
}
function headStats(pos, idx) {
  const c = [0, 0, 0]; for (const i of idx) { c[0] += pos[i * 3]; c[1] += pos[i * 3 + 1]; c[2] += pos[i * 3 + 2]; }
  c[0] /= idx.length; c[1] /= idx.length; c[2] /= idx.length;
  let r = 0; for (const i of idx) r = Math.max(r, Math.hypot(pos[i * 3] - c[0], pos[i * 3 + 1] - c[1], pos[i * 3 + 2] - c[2]));
  return { c, r: r || 1 };
}

export function transferRig(targetBuffer, donorBuffer, opts = {}) {
  const t = readGlb(targetBuffer), d = readGlb(donorBuffer);
  if (detectSpec(t.json) !== "1.0") throw new Error("target must be a VRM 1.0 body base");

  const tPos = positions(t.json, t.bin), tCount = tPos.length / 3;
  const D = donorField(d.json, d.bin);
  const dPos = D.pos, dCount = D.count, dDeltas = D.deltas;

  const tIdx = headIdx(tPos, tCount);
  // donor correspondence = vertices that ACTUALLY move in some expression (the rig
  // region). Robust across donors regardless of mesh layout (face-only vs full body).
  const active = new Uint8Array(dCount);
  for (const dd of dDeltas.values()) { if (!dd) continue; for (let i = 0; i < dCount; i++) if (dd[i * 3] || dd[i * 3 + 1] || dd[i * 3 + 2]) active[i] = 1; }
  let dIdx = []; for (let i = 0; i < dCount; i++) if (active[i]) dIdx.push(i);
  if (!dIdx.length) dIdx = headIdx(dPos, dCount);
  const ts = headStats(tPos, tIdx), ds = headStats(dPos, dIdx);
  const scale = ts.r / ds.r;

  const cell = ts.r / 18 || 0.01;
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map();
  const dAligned = new Float32Array(dIdx.length * 3);
  dIdx.forEach((di, k) => {
    const ax = (dPos[di * 3] - ds.c[0]) / ds.r * ts.r + ts.c[0];
    const ay = (dPos[di * 3 + 1] - ds.c[1]) / ds.r * ts.r + ts.c[1];
    const az = (dPos[di * 3 + 2] - ds.c[2]) / ds.r * ts.r + ts.c[2];
    dAligned[k * 3] = ax; dAligned[k * 3 + 1] = ay; dAligned[k * 3 + 2] = az;
    const kk = key(ax, ay, az); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push({ k, di });
  });

  const nearest = (x, y, z, K = 4) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell); let cand = [];
    for (let r = 1; r <= 5 && cand.length < K; r++) { cand = []; for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let l = -r; l <= r; l++) { const arr = grid.get(`${cx + i},${cy + j},${cz + l}`); if (arr) cand.push(...arr); } }
    return cand.map(({ k, di }) => ({ di, d2: (dAligned[k * 3] - x) ** 2 + (dAligned[k * 3 + 1] - y) ** 2 + (dAligned[k * 3 + 2] - z) ** 2 })).sort((a, b) => a.d2 - b.d2).slice(0, K);
  };

  const transferred = new Map();
  for (const [name, dd] of dDeltas) {
    if (!dd) { transferred.set(name, null); continue; }
    const out = new Float32Array(tCount * 3);
    for (const ti of tIdx) {
      const nn = nearest(tPos[ti * 3], tPos[ti * 3 + 1], tPos[ti * 3 + 2]);
      if (!nn.length) continue;
      let wsum = 0, dx = 0, dy = 0, dz = 0;
      for (const { di, d2 } of nn) { const w = 1 / (Math.sqrt(d2) + 1e-6); wsum += w; dx += w * dd[di * 3]; dy += w * dd[di * 3 + 1]; dz += w * dd[di * 3 + 2]; }
      out[ti * 3] = dx / wsum * scale; out[ti * 3 + 1] = dy / wsum * scale; out[ti * 3 + 2] = dz / wsum * scale;
    }
    transferred.set(name, out);
  }

  return writeMorphsAndBind(t, transferred, tCount, dIdx, { donorSpec: detectSpec(d.json), multiMesh: D.multiMesh });
}

function writeMorphsAndBind(t, transferred, tCount, dIdx, meta) {
  const { json, bin, version } = t;
  const { node: meshNode, mesh, prim } = meshInfo(json);
  prim.targets = prim.targets || []; mesh.weights = mesh.weights || [];
  const chunks = [Buffer.from(bin)]; let off = bin.length;
  const pad4 = (n) => (4 - (n % 4)) % 4;
  const tIndex = {}; const added = [];
  for (const [name, delta] of transferred) {
    if (!delta) continue;
    const p = pad4(off); if (p) { chunks.push(Buffer.alloc(p, 0)); off += p; }
    const buf = Buffer.alloc(delta.length * 4); for (let i = 0; i < delta.length; i++) buf.writeFloatLE(delta[i], i * 4);
    const bvIdx = json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length }) - 1;
    chunks.push(buf); off += buf.length;
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < delta.length; i += 3) for (let k = 0; k < 3; k++) { const v = delta[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    const accIdx = json.accessors.push({ bufferView: bvIdx, componentType: 5126, count: tCount, type: "VEC3", min: mn, max: mx }) - 1;
    prim.targets.push({ POSITION: accIdx }); mesh.weights.push(0);
    tIndex[name] = prim.targets.length - 1; added.push(name);
  }
  const preset = json.extensions.VRMC_vrm.expressions.preset = json.extensions.VRMC_vrm.expressions.preset || {};
  const empty = { morphTargetBinds: [], materialColorBinds: [], textureTransformBinds: [], overrideBlink: "none", overrideLookAt: "none", overrideMouth: "none" };
  for (const name of REQUIRED_EXPRESSIONS) {
    if (name === "neutral") { preset.neutral = { ...empty, isBinary: false }; continue; }
    if (tIndex[name] != null) preset[name] = { ...empty, isBinary: name === "blink", morphTargetBinds: [{ node: meshNode, index: tIndex[name], weight: 1 }] };
  }
  json.buffers[0].byteLength = Buffer.concat(chunks).length;
  const missing = REQUIRED_EXPRESSIONS.filter((n) => n !== "neutral" && tIndex[n] == null);
  return {
    buffer: writeGlb({ json, bin: Buffer.concat(chunks), version }),
    report: { transferred: added, missingFromDonor: missing, donorSpec: meta.donorSpec, donorMultiMesh: meta.multiMesh, note: missing.length ? `donor lacked: ${missing.join(", ")}` : "all required expressions transferred from donor" },
  };
}
