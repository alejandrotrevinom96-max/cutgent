import { readGlb, writeGlb } from "./glb.mjs";
import { detectSpec } from "./vrm.mjs";

// bakeDemo — write a REAL glTF animation INTO the VRM so it self-plays in any
// viewer: facial morphs (blink/smile/spoken visemes/surprised) + a full-body IDLE
// (breathing, shoulder/arm sway, weight shift, head bob). Bone rotations are
// COMPOSED with each bone's REST rotation (rest * delta) so the A-pose is preserved
// and the motion is additive — never snaps the limbs. Pure Node, appends to the BIN.

const f32 = (a) => { const b = Buffer.alloc(a.length * 4); for (let i = 0; i < a.length; i++) b.writeFloatLE(a[i], i * 4); return b; };
const pad4 = (n) => (4 - (n % 4)) % 4;
const bump = (t, c, w) => Math.exp(-((t - c) * (t - c)) / (w * w));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const axisAngle = (ax, ay, az, ang) => { const s = Math.sin(ang / 2); return [ax * s, ay * s, az * s, Math.cos(ang / 2)]; };
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

const restRotOf = (json, node) => json.nodes[node].rotation || [0, 0, 0, 1];
const restTransOf = (json, node) => json.nodes[node].translation || [0, 0, 0];
const smooth = (a, b, t) => { const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
const win = (t, a, b) => (t >= a && t <= b ? 1 : 0);

// bakeShowcase — a "she can do everything" reel baked into the .vrm: idle+face,
// a full 360° TURN, and a WALK-in-place cycle (legs/arms/hips), composed with the
// rest pose. Proves full-skeleton mobility in one openable file. EXPERIMENTAL axes
// (rig-dependent) — eyeball it. Real production uses authored clips per motion.
export function bakeShowcase(vrmBuffer, opts = {}) {
  const { json, bin, version } = readGlb(vrmBuffer);
  if (detectSpec(json) !== "1.0") throw new Error("bakeShowcase expects a VRM 1.0");
  const meshNode = json.nodes.findIndex((n) => n.mesh != null);
  const prim = meshNode >= 0 ? json.meshes[json.nodes[meshNode].mesh].primitives[0] : null;
  const T = prim && prim.targets ? prim.targets.length : 0;
  const preset = (json.extensions.VRMC_vrm.expressions && json.extensions.VRMC_vrm.expressions.preset) || {};
  const idxOf = (name) => { const b = preset[name] && preset[name].morphTargetBinds && preset[name].morphTargetBinds[0]; return b ? b.index : -1; };
  const hb = json.extensions.VRMC_vrm.humanoid.humanBones;
  const bn = (name) => (hb[name] ? hb[name].node : null);

  const dur = 12, fps = 20, K = dur * fps + 1;
  const times = new Float32Array(K);
  const weights = new Float32Array(K * T);
  const setW = (k, name, v) => { const ti = idxOf(name); if (ti >= 0) weights[k * T + ti] = Math.max(weights[k * T + ti], Math.max(0, Math.min(1, v))); };
  const rot = new Map(); const trans = new Map();
  const useRot = (name) => { const n = bn(name); if (n == null) return null; if (!rot.has(name)) rot.set(name, new Float32Array(K * 4)); return n; };
  const useTrans = (name) => { const n = bn(name); if (n == null) return null; if (!trans.has(name)) trans.set(name, new Float32Array(K * 3)); return n; };
  // pre-register the bones we'll touch
  for (const b of ["spine", "chest", "neck", "head", "hips", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg"]) useRot(b);
  useTrans("hips");
  const putR = (name, k, q) => { const o = rot.get(name); if (o) { o[k * 4] = q[0]; o[k * 4 + 1] = q[1]; o[k * 4 + 2] = q[2]; o[k * 4 + 3] = q[3]; } };
  const setR = (name, k, ax, ang) => { const n = bn(name); if (n == null) return; putR(name, k, qmul(restRotOf(json, n), axisAngle(ax[0], ax[1], ax[2], ang))); };

  // segments: 0-3 idle, 3-6 TURN 360, 6-12 WALK in place (+ continuous breathe/blink/face)
  const turnA = 3, turnB = 6, walkA = 6;
  for (let k = 0; k < K; k++) {
    const t = k / fps; times[k] = t;
    // face: blinks throughout, a smile early, a little "hello" mouth during turn
    setW(k, "blink", bump(t, 1.0, 0.05) + bump(t, 4.5, 0.05) + bump(t, 8.0, 0.05) + bump(t, 11.0, 0.05));
    setW(k, "happy", smooth(0.6, 1.4, t) * (1 - smooth(2.4, 3.0, t)) * 0.8 + smooth(walkA, walkA + 1, t) * 0.5);
    if (t > 4 && t < 6) { const v = ["aa", "ih", "ou"]; for (let i = 0; i < v.length; i++) setW(k, v[i], bump(t, 4.3 + i * 0.4, 0.12)); }
    // breathing (always)
    const br = Math.sin(t * 1.4) * 0.025;
    setR("spine", k, [1, 0, 0], br); setR("chest", k, [1, 0, 0], br * 0.8); setR("neck", k, [1, 0, 0], -br * 0.6);
    setR("head", k, [0, 1, 0], Math.sin(t * 0.8) * 0.06);
    // TURN 360 about Y (hips yaw), eased
    const turn = smooth(turnA, turnB, t) * Math.PI * 2 * win(t, turnA, dur);
    const hipsYaw = Math.sin(t * 0.5) * 0.02 + turn;
    setR("hips", k, [0, 1, 0], hipsYaw);
    // WALK in place after walkA: alternating legs + counter arms
    if (t >= walkA) {
      const p = (t - walkA) * 1.2 * Math.PI * 2; // ~1.2 steps/sec
      setR("leftUpperLeg", k, [1, 0, 0], Math.sin(p) * 0.45);
      setR("rightUpperLeg", k, [1, 0, 0], Math.sin(p + Math.PI) * 0.45);
      setR("leftLowerLeg", k, [1, 0, 0], Math.max(0, -Math.sin(p)) * 0.8);
      setR("rightLowerLeg", k, [1, 0, 0], Math.max(0, -Math.sin(p + Math.PI)) * 0.8);
      setR("leftUpperArm", k, [0, 0, 1], 0.04 + Math.sin(p + Math.PI) * 0.18);
      setR("rightUpperArm", k, [0, 0, 1], 0.04 + Math.sin(p) * 0.18);
      const ht = trans.get("hips"); const rt = restTransOf(json, bn("hips")); if (ht) { ht[k * 3] = rt[0]; ht[k * 3 + 1] = rt[1] + Math.abs(Math.sin(p)) * 0.02; ht[k * 3 + 2] = rt[2]; }
    } else {
      // arms relaxed sway during idle/turn
      setR("leftUpperArm", k, [0, 0, 1], 0.04 + Math.sin(t * 0.8) * 0.05);
      setR("rightUpperArm", k, [0, 0, 1], 0.04 + Math.sin(t * 0.8 + Math.PI) * 0.05);
      const ht = trans.get("hips"); const rt = restTransOf(json, bn("hips")); if (ht) { ht[k * 3] = rt[0]; ht[k * 3 + 1] = rt[1] + Math.sin(t * 1.4) * 0.006; ht[k * 3 + 2] = rt[2]; }
    }
  }

  // write
  const chunks = [Buffer.from(bin)]; let off = bin.length;
  const addAcc = (arr, type, extra = {}) => { const p = pad4(off); if (p) { chunks.push(Buffer.alloc(p, 0)); off += p; } const buf = f32(arr); const bvIdx = json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length }) - 1; chunks.push(buf); off += buf.length; const comp = type === "SCALAR" ? 1 : type === "VEC4" ? 4 : 3; return json.accessors.push({ bufferView: bvIdx, componentType: 5126, count: arr.length / comp, type, ...extra }) - 1; };
  const tAcc = addAcc(times, "SCALAR", { min: [0], max: [times[K - 1]] });
  const samplers = [], channels = [];
  const addChan = (out, type, node, path) => { const a = addAcc(out, type); samplers.push({ input: tAcc, output: a, interpolation: "LINEAR" }); channels.push({ sampler: samplers.length - 1, target: { node, path } }); };
  if (T) addChan(weights, "SCALAR", meshNode, "weights");
  for (const [name, arr] of rot) addChan(arr, "VEC4", bn(name), "rotation");
  for (const [name, arr] of trans) addChan(arr, "VEC3", bn(name), "translation");
  json.animations = [{ name: opts.name || "MCProid_Showcase", samplers, channels }];
  json.buffers[0].byteLength = Buffer.concat(chunks).length;
  if (prim) { const mesh = json.meshes[json.nodes[meshNode].mesh]; mesh.weights = mesh.weights || new Array(T).fill(0); }
  return { buffer: writeGlb({ json, bin: Buffer.concat(chunks), version }), report: { keyframes: K, duration: dur, segments: ["idle", "turn360", "walk"], rotationTracks: rot.size, hasWalk: bn("leftUpperLeg") != null, note: "Self-playing reel: idle+face, 360 turn, walk-in-place. EXPERIMENTAL bone axes." } };
}

export function bakeDemo(vrmBuffer, opts = {}) {
  const { json, bin, version } = readGlb(vrmBuffer);
  if (detectSpec(json) !== "1.0") throw new Error("bakeDemo expects a VRM 1.0");
  const meshNode = json.nodes.findIndex((n) => n.mesh != null);
  const prim = meshNode >= 0 ? json.meshes[json.nodes[meshNode].mesh].primitives[0] : null;
  const T = prim && prim.targets ? prim.targets.length : 0;
  const preset = (json.extensions.VRMC_vrm.expressions && json.extensions.VRMC_vrm.expressions.preset) || {};
  const idxOf = (name) => { const b = preset[name] && preset[name].morphTargetBinds && preset[name].morphTargetBinds[0]; return b ? b.index : -1; };
  const hb = json.extensions.VRMC_vrm.humanoid.humanBones;
  const boneNode = (name) => (hb[name] ? hb[name].node : null);

  const dur = 6, fps = 20, K = dur * fps + 1;
  const times = new Float32Array(K);
  const weights = new Float32Array(K * T);
  const set = (k, name, v) => { const ti = idxOf(name); if (ti >= 0) weights[k * T + ti] = Math.max(weights[k * T + ti], clamp01(v)); };

  // body idle: per-bone (axis, angularSpeed, amplitude, phase) -> additive rotation
  const idle = [
    ["spine", [1, 0, 0], 1.4, 0.030, 0], ["chest", [1, 0, 0], 1.4, 0.025, 0.2], ["upperChest", [1, 0, 0], 1.4, 0.020, 0.3],
    ["neck", [1, 0, 0], 1.4, -0.020, 0], ["head", [0, 1, 0], 0.9, 0.10, 0],
    ["leftShoulder", [0, 0, 1], 0.9, 0.020, 0], ["rightShoulder", [0, 0, 1], 0.9, 0.020, Math.PI],
    ["leftUpperArm", [0, 0, 1], 0.8, 0.055, 0], ["rightUpperArm", [0, 0, 1], 0.8, 0.055, Math.PI],
    ["leftLowerArm", [0, 0, 1], 0.8, 0.030, 0.5], ["rightLowerArm", [0, 0, 1], 0.8, 0.030, Math.PI + 0.5],
    ["hips", [0, 1, 0], 0.5, 0.025, 0],
  ].filter((b) => boneNode(b[0]) != null);

  const rotOut = new Map(); // boneName -> Float32Array(K*4)
  for (const [name, ax, spd, amp] of idle) rotOut.set(name, new Float32Array(K * 4));
  const hipsNode = boneNode("hips");
  const hipsTrans = hipsNode != null ? new Float32Array(K * 3) : null; // subtle vertical bob
  const restRot = (node) => json.nodes[node].rotation || [0, 0, 0, 1];
  const restTrans = (node) => json.nodes[node].translation || [0, 0, 0];

  for (let k = 0; k < K; k++) {
    const t = k / fps; times[k] = t;
    // ---- face ----
    set(k, "blink", bump(t, 0.6, 0.05) + bump(t, 3.2, 0.05) + bump(t, 5.2, 0.05));
    set(k, "happy", clamp01((t - 1.0) / 0.6) * clamp01((2.6 - t) / 0.6) * 0.9);
    const vis = ["aa", "ih", "ou", "ee", "oh"];
    if (t >= 2.8 && t <= 4.8) for (let i = 0; i < vis.length; i++) set(k, vis[i], bump(t, 2.9 + i * 0.38, 0.13));
    set(k, "surprised", bump(t, 5.0, 0.12));
    // ---- body idle (composed with rest) ----
    for (const [name, ax, spd, amp, ph] of idle) {
      const node = boneNode(name);
      const q = qmul(restRot(node), axisAngle(ax[0], ax[1], ax[2], Math.sin(t * spd + ph) * amp + (name === "head" ? Math.sin(t * 1.7) * 0.04 : 0)));
      const o = rotOut.get(name); o[k * 4] = q[0]; o[k * 4 + 1] = q[1]; o[k * 4 + 2] = q[2]; o[k * 4 + 3] = q[3];
    }
    if (hipsTrans) { const rt = restTrans(hipsNode); hipsTrans[k * 3] = rt[0]; hipsTrans[k * 3 + 1] = rt[1] + Math.sin(t * 1.4) * 0.008; hipsTrans[k * 3 + 2] = rt[2]; }
  }

  // append accessors
  const chunks = [Buffer.from(bin)]; let off = bin.length;
  const addAcc = (arr, type, extra = {}) => {
    const p = pad4(off); if (p) { chunks.push(Buffer.alloc(p, 0)); off += p; }
    const buf = f32(arr); const bvIdx = json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length }) - 1;
    chunks.push(buf); off += buf.length;
    const comp = type === "SCALAR" ? 1 : type === "VEC4" ? 4 : 3;
    return json.accessors.push({ bufferView: bvIdx, componentType: 5126, count: arr.length / comp, type, ...extra }) - 1;
  };
  const tAcc = addAcc(times, "SCALAR", { min: [0], max: [times[K - 1]] });
  const samplers = [], channels = [];
  if (T) { const wAcc = addAcc(weights, "SCALAR"); samplers.push({ input: tAcc, output: wAcc, interpolation: "LINEAR" }); channels.push({ sampler: samplers.length - 1, target: { node: meshNode, path: "weights" } }); }
  for (const [name] of idle) { const rAcc = addAcc(rotOut.get(name), "VEC4"); samplers.push({ input: tAcc, output: rAcc, interpolation: "LINEAR" }); channels.push({ sampler: samplers.length - 1, target: { node: boneNode(name), path: "rotation" } }); }
  if (hipsTrans) { const trAcc = addAcc(hipsTrans, "VEC3"); samplers.push({ input: tAcc, output: trAcc, interpolation: "LINEAR" }); channels.push({ sampler: samplers.length - 1, target: { node: hipsNode, path: "translation" } }); }

  json.animations = [{ name: opts.name || "MCProid_Demo", samplers, channels }];
  json.buffers[0].byteLength = Buffer.concat(chunks).length;
  if (prim) { const mesh = json.meshes[json.nodes[meshNode].mesh]; mesh.weights = mesh.weights || new Array(T).fill(0); }

  return {
    buffer: writeGlb({ json, bin: Buffer.concat(chunks), version }),
    report: { keyframes: K, duration: dur, faceMorphTrack: T > 0, bodyBoneTracks: idle.length, hipsBob: !!hipsTrans, bones: idle.map((b) => b[0]), note: "Self-playing: facial morphs + full-body idle (breathing, sway, weight shift, head bob), composed with rest pose." },
  };
}
