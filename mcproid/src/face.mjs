import { readGlb, writeGlb } from "./glb.mjs";
import { detectSpec } from "./vrm.mjs";

// MCProid facial-rig ENGINE v3 — the headless technological ceiling. VRoid wins by
// OWNING topology; we don't, so we push every lever a headless tool can:
//   - mesh CONNECTIVITY (from indices) -> SURFACE (geodesic) falloff, so deformation
//     spreads along the skin and never bleeds across gaps (lips/chin/eyes),
//   - NORMAL-based front detection + nose-tip anchor (auto, robust),
//   - JAW as a HINGE ROTATION (anatomical mouth open) instead of a translate,
//   - LAPLACIAN smoothing of every delta field (no jaggies/blobs),
//   - FACS action units -> the 12 VRM expressions, symmetric by construction.
// Falls back to Euclidean falloff when a mesh has no indices. The morph plumbing
// is exact and gated; placement is estimated — beyond this needs topology semantics
// (donor transfer / ML landmarks), which is the real wall.

const f32 = (a) => { const b = Buffer.alloc(a.length * 4); for (let i = 0; i < a.length; i++) b.writeFloatLE(a[i], i * 4); return b; };
const pad4 = (n) => (4 - (n % 4)) % 4;

function readVec3(json, bin, accIdx) {
  const acc = json.accessors[accIdx]; const bv = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float32Array(acc.count * 3);
  for (let i = 0; i < acc.count * 3; i++) out[i] = bin.readFloatLE(base + i * 4);
  return out;
}
function readIndices(json, bin, accIdx) {
  if (accIdx == null) return null;
  const acc = json.accessors[accIdx]; const bv = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Uint32Array(acc.count);
  const u16 = acc.componentType === 5123;
  for (let i = 0; i < acc.count; i++) out[i] = u16 ? bin.readUInt16LE(base + i * 2) : bin.readUInt32LE(base + i * 4);
  return out;
}
function buildAdjacency(indices, count) {
  const adj = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b);
  }
  return adj.map((s) => [...s]);
}
// multi-isn't needed; single-source Dijkstra capped at maxDist (binary heap)
function geodesic(adj, pos, seed, maxDist) {
  const n = adj.length; const dist = new Float64Array(n).fill(Infinity); dist[seed] = 0;
  const heap = [[0, seed]]; const D = (i, j) => { const dx = pos[i * 3] - pos[j * 3], dy = pos[i * 3 + 1] - pos[j * 3 + 1], dz = pos[i * 3 + 2] - pos[j * 3 + 2]; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
  const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break;[heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
  while (heap.length) {
    const [d, u] = pop(); if (d > dist[u]) continue; if (d > maxDist) continue;
    for (const v of adj[u]) { const nd = d + D(u, v); if (nd < dist[v]) { dist[v] = nd; if (nd <= maxDist) push(nd, v); } }
  }
  return dist;
}
function nearestVertex(pos, count, p, predicate) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < count; i++) { if (predicate && !predicate(i)) continue; const dx = pos[i * 3] - p[0], dy = pos[i * 3 + 1] - p[1], dz = pos[i * 3 + 2] - p[2]; const d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = i; } }
  return best;
}
function laplacianSmooth(delta, adj, affected, iters = 4, lambda = 0.5) {
  if (!adj) return delta;
  let cur = delta;
  for (let it = 0; it < iters; it++) {
    const next = Float32Array.from(cur);
    for (const i of affected) {
      const ns = adj[i]; if (!ns.length) continue;
      for (let k = 0; k < 3; k++) { let s = 0; for (const j of ns) s += cur[j * 3 + k]; next[i * 3 + k] = (1 - lambda) * cur[i * 3 + k] + lambda * (s / ns.length); }
    }
    cur = next;
  }
  return cur;
}

function readMesh(json, bin) {
  const meshNode = (json.nodes || []).findIndex((n) => n.mesh != null);
  if (meshNode < 0) throw new Error("no mesh node");
  const prim = json.meshes[json.nodes[meshNode].mesh].primitives[0];
  const pos = readVec3(json, bin, prim.attributes.POSITION);
  const nrm = prim.attributes.NORMAL != null ? readVec3(json, bin, prim.attributes.NORMAL) : null;
  const idx = readIndices(json, bin, prim.indices);
  const count = pos.length / 3;
  return { meshNode, meshIndex: json.nodes[meshNode].mesh, prim, count, pos, nrm, idx, adj: idx ? buildAdjacency(idx, count) : null };
}

function anatomy(pos, nrm, count, frontOpt) {
  let minY = Infinity, maxY = -Infinity, maxAbsX = 0;
  for (let i = 0; i < count; i++) { const y = pos[i * 3 + 1], x = Math.abs(pos[i * 3]); if (y < minY) minY = y; if (y > maxY) maxY = y; if (x > maxAbsX) maxAbsX = x; }
  const headMinY = minY + 0.80 * (maxY - minY), headH = (maxY - headMinY) || 1, headW = maxAbsX || 1;
  // front: prefer NORMAL z-sum over head; fall back to protrusion
  let front = frontOpt;
  if (front !== "+z" && front !== "-z") {
    if (nrm) { let s = 0; for (let i = 0; i < count; i++) if (pos[i * 3 + 1] >= headMinY) s += nrm[i * 3 + 2]; front = s >= 0 ? "+z" : "-z"; }
    else { const pr = (zf) => { let m = -Infinity; for (let i = 0; i < count; i++) if (pos[i * 3 + 1] >= headMinY && Math.abs(pos[i * 3]) < 0.18 * headW) m = Math.max(m, zf * pos[i * 3 + 2]); return m; }; front = pr(1) >= pr(-1) ? "+z" : "-z"; }
  }
  const zf = front === "-z" ? -1 : 1;
  let nose = null, bestZ = -Infinity;
  for (let i = 0; i < count; i++) { const y = pos[i * 3 + 1]; if (y < headMinY) continue; const x = pos[i * 3], z = zf * pos[i * 3 + 2]; if (Math.abs(x) > 0.18 * headW) continue; const hy = (y - headMinY) / headH; if (hy < 0.25 || hy > 0.75) continue; if (z > bestZ) { bestZ = z; nose = [x, y, pos[i * 3 + 2]]; } }
  nose = nose || [0, headMinY + 0.5 * headH, zf * headW];
  const [nx, ny, nz] = nose;
  return {
    front, zf, headH, headW, headMinY,
    mouth: [nx, ny - 0.16 * headH, nz * 0.92],
    eyeL: [nx + 0.42 * headW, ny + 0.10 * headH, nz * 0.82],
    eyeR: [nx - 0.42 * headW, ny + 0.10 * headH, nz * 0.82],
    browL: [nx + 0.42 * headW, ny + 0.22 * headH, nz * 0.80],
    browR: [nx - 0.42 * headW, ny + 0.22 * headH, nz * 0.80],
    hinge: [nx, ny + 0.04 * headH, nz - 0.55 * headH], // jaw pivot: ear height, behind face
  };
}

// weight field around an anchor: geodesic if connectivity exists, else euclidean
function weightField(M, anchorPoint, R, predicate) {
  const { pos, count, adj } = M;
  const w = new Float32Array(count);
  const seed = nearestVertex(pos, count, anchorPoint, predicate);
  if (seed < 0) return { w, affected: [] };
  const affected = [];
  if (adj) {
    const dist = geodesic(adj, pos, seed, 3 * R);
    for (let i = 0; i < count; i++) { if (!isFinite(dist[i])) continue; if (predicate && !predicate(i)) continue; const ww = Math.exp(-(dist[i] * dist[i]) / (R * R)); if (ww > 0.02) { w[i] = ww; affected.push(i); } }
  } else {
    for (let i = 0; i < count; i++) { if (predicate && !predicate(i)) continue; const dx = pos[i * 3] - anchorPoint[0], dy = pos[i * 3 + 1] - anchorPoint[1], dz = pos[i * 3 + 2] - anchorPoint[2]; const ww = Math.exp(-(dx * dx + dy * dy + dz * dz) / (R * R)); if (ww > 0.02) { w[i] = ww; affected.push(i); } }
  }
  return { w, affected };
}

export function riggFace(vrmBuffer, opts = {}) {
  const { json, bin, version } = readGlb(vrmBuffer);
  if (detectSpec(json) !== "1.0") throw new Error("riggFace expects a VRM 1.0 body base (run import_glb first)");
  if (!bin) throw new Error("VRM has no geometry (BIN)");
  const M = readMesh(json, bin);
  const { pos, count, adj } = M;
  const A = anatomy(pos, M.nrm, count, opts.front);
  const h = A.headH, m = (s) => s * h;
  const headOnly = (i) => pos[i * 3 + 1] >= A.headMinY;

  const Wm = weightField(M, A.mouth, 0.16 * h, headOnly);
  const WeL = weightField(M, A.eyeL, 0.10 * h, headOnly);
  const WeR = weightField(M, A.eyeR, 0.10 * h, headOnly);
  const Wb = weightField(M, A.browL, 0.12 * h, headOnly); // brow uses both via union below
  const WbR = weightField(M, A.browR, 0.12 * h, headOnly);

  const zero = () => new Float32Array(count * 3);
  const x0 = A.mouth[0];

  // jawOpen: rotate lower-face verts about the jaw hinge (pitch), weighted by mouth field
  const jawOpen = zero(); { const th = 0.20, [hx, hy, hz] = A.hinge; for (const i of Wm.affected) { if (pos[i * 3 + 1] > A.mouth[1] + 0.05 * h) continue; const ww = Wm.w[i], ang = th * ww; const y = pos[i * 3 + 1] - hy, z = pos[i * 3 + 2] - hz; const ny = hy + y * Math.cos(ang) - z * Math.sin(ang), nz = hz + y * Math.sin(ang) + z * Math.cos(ang); jawOpen[i * 3 + 1] = ny - pos[i * 3 + 1]; jawOpen[i * 3 + 2] = nz - pos[i * 3 + 2]; } }
  const lipStretch = zero(); for (const i of Wm.affected) lipStretch[i * 3] = Math.sign(pos[i * 3] - x0) * m(0.05) * Wm.w[i];
  const lipPucker = zero(); for (const i of Wm.affected) { lipPucker[i * 3] = -(pos[i * 3] - x0) * 0.5 * Wm.w[i]; lipPucker[i * 3 + 2] = A.zf * m(0.05) * Wm.w[i]; }
  const smile = zero(); for (const i of Wm.affected) { const c = Math.min(1, Math.abs(pos[i * 3] - x0) / (0.5 * 0.16 * h)); smile[i * 3 + 1] = m(0.06) * Wm.w[i] * c; }
  const frown = zero(); for (const i of Wm.affected) { const c = Math.min(1, Math.abs(pos[i * 3] - x0) / (0.5 * 0.16 * h)); frown[i * 3 + 1] = -m(0.05) * Wm.w[i] * c; }
  const blink = zero(); { const eyeTopY = Math.max(A.eyeL[1], A.eyeR[1]); for (const W of [WeL, WeR]) for (const i of W.affected) { const upper = pos[i * 3 + 1] > eyeTopY - 0.25 * (0.10 * h) ? 1 : 0.2; blink[i * 3 + 1] = -m(0.045) * W.w[i] * upper; } }
  const browUp = zero(); for (const W of [Wb, WbR]) for (const i of W.affected) browUp[i * 3 + 1] = m(0.05) * W.w[i];
  const browDown = zero(); for (const W of [Wb, WbR]) for (const i of W.affected) browDown[i * 3 + 1] = -m(0.05) * W.w[i];

  // Laplacian smoothing on each field (surface-aware, removes jaggies)
  const mouthAff = Wm.affected, eyeAff = [...WeL.affected, ...WeR.affected], browAff = [...Wb.affected, ...WbR.affected];
  const AU = {
    jawOpen: laplacianSmooth(jawOpen, adj, mouthAff), lipStretch: laplacianSmooth(lipStretch, adj, mouthAff),
    lipPucker: laplacianSmooth(lipPucker, adj, mouthAff), smile: laplacianSmooth(smile, adj, mouthAff),
    frown: laplacianSmooth(frown, adj, mouthAff), blink: laplacianSmooth(blink, adj, eyeAff),
    browUp: laplacianSmooth(browUp, adj, browAff), browDown: laplacianSmooth(browDown, adj, browAff),
  };

  // append morph targets
  const order = ["jawOpen", "lipStretch", "lipPucker", "smile", "frown", "blink", "browUp", "browDown"];
  const chunks = [Buffer.from(bin)]; let off = bin.length;
  M.prim.targets = M.prim.targets || [];
  const mesh = json.meshes[M.meshIndex]; mesh.weights = mesh.weights || [];
  const tIndex = {};
  for (const name of order) {
    const delta = AU[name]; const p = pad4(off); if (p) { chunks.push(Buffer.alloc(p, 0)); off += p; }
    const buf = f32(delta); const bvIdx = json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length }) - 1;
    chunks.push(buf); off += buf.length;
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < delta.length; i += 3) for (let k = 0; k < 3; k++) { const v = delta[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    const accIdx = json.accessors.push({ bufferView: bvIdx, componentType: 5126, count, type: "VEC3", min: mn, max: mx }) - 1;
    M.prim.targets.push({ POSITION: accIdx }); mesh.weights.push(0); tIndex[name] = M.prim.targets.length - 1;
  }

  const B = (binds) => ({ morphTargetBinds: binds.map(([n, ww]) => ({ node: M.meshNode, index: tIndex[n], weight: ww })), materialColorBinds: [], textureTransformBinds: [], isBinary: false, overrideBlink: "none", overrideLookAt: "none", overrideMouth: "none" });
  const preset = (json.extensions.VRMC_vrm.expressions.preset = json.extensions.VRMC_vrm.expressions.preset || {});
  preset.happy = B([["smile", 1]]); preset.sad = B([["frown", 1], ["browUp", 0.3]]); preset.angry = B([["browDown", 1], ["frown", 0.4]]);
  preset.relaxed = B([["smile", 0.4]]); preset.surprised = B([["jawOpen", 0.6], ["browUp", 1]]); preset.neutral = B([]);
  preset.aa = B([["jawOpen", 1]]); preset.ih = B([["lipStretch", 1]]); preset.ou = B([["lipPucker", 1]]);
  preset.ee = B([["lipStretch", 0.8], ["jawOpen", 0.15]]); preset.oh = B([["jawOpen", 0.5], ["lipPucker", 0.5]]);
  preset.blink = { ...B([["blink", 1]]), isBinary: true };

  const newBin = Buffer.concat(chunks); json.buffers[0].byteLength = newBin.length;
  const report = {
    verts: count, front: A.front, connectivity: adj ? "geodesic (surface)" : "euclidean (no indices)",
    jaw: "hinge rotation", smoothing: "laplacian x4",
    affected: { mouth: mouthAff.length, eyes: eyeAff.length, brows: browAff.length },
    actionUnits: order.length, expressions: 12,
    method: "v3: normal front + nose anchor + geodesic falloff + jaw-hinge + laplacian + FACS, symmetric",
    quality: "PROCEDURAL ceiling (headless). Beyond this needs topology semantics (donor transfer / ML landmarks). Eyeball it; flip --front if needed.",
  };
  return { buffer: writeGlb({ json, bin: newBin, version }), report, tIndex };
}
