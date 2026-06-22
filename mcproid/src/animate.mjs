import { readGlb, writeGlb } from "./glb.mjs";
import { detectSpec } from "./vrm.mjs";

// bakeDemo — write a REAL glTF animation INTO the VRM so it self-plays in any
// viewer (blink, smile, a short spoken sentence via visemes, a gentle head bob).
// A VRM is normally a riggable model driven live by an app; this bakes a demo
// timeline as actual keyframed tracks (morph-target weights + head rotation) so you
// can SEE her move without any runtime. Pure Node, appends accessors to the BIN.

const f32 = (a) => { const b = Buffer.alloc(a.length * 4); for (let i = 0; i < a.length; i++) b.writeFloatLE(a[i], i * 4); return b; };
const pad4 = (n) => (4 - (n % 4)) % 4;
const bump = (t, c, w) => Math.exp(-((t - c) * (t - c)) / (w * w));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function bakeDemo(vrmBuffer, opts = {}) {
  const { json, bin, version } = readGlb(vrmBuffer);
  if (detectSpec(json) !== "1.0") throw new Error("bakeDemo expects a VRM 1.0");
  const meshNode = json.nodes.findIndex((n) => n.mesh != null);
  if (meshNode < 0) throw new Error("no mesh node");
  const prim = json.meshes[json.nodes[meshNode].mesh].primitives[0];
  const T = (prim.targets || []).length;
  if (!T) throw new Error("VRM has no morph targets to animate");
  const preset = (json.extensions.VRMC_vrm.expressions && json.extensions.VRMC_vrm.expressions.preset) || {};
  const idxOf = (name) => { const b = preset[name] && preset[name].morphTargetBinds && preset[name].morphTargetBinds[0]; return b ? b.index : -1; };
  const headNode = json.extensions.VRMC_vrm.humanoid && json.extensions.VRMC_vrm.humanoid.humanBones.head && json.extensions.VRMC_vrm.humanoid.humanBones.head.node;

  // timeline: 0..6s at 20 fps
  const dur = 6, fps = 20, K = dur * fps + 1;
  const times = new Float32Array(K);
  const weights = new Float32Array(K * T);     // per keyframe, all morph weights
  const rot = new Float32Array(K * 4);         // head quaternion per keyframe
  const set = (k, name, v) => { const ti = idxOf(name); if (ti >= 0) weights[k * T + ti] = Math.max(weights[k * T + ti], clamp01(v)); };

  for (let k = 0; k < K; k++) {
    const t = k / fps; times[k] = t;
    // blinks
    const bl = bump(t, 0.6, 0.05) + bump(t, 3.2, 0.05) + bump(t, 5.2, 0.05);
    set(k, "blink", bl);
    // smile swell 1.0 -> 2.2
    set(k, "happy", clamp01((t - 1.0) / 0.6) * clamp01((2.6 - t) / 0.6));
    // spoken sentence via visemes 2.8 -> 4.6 (cycle aa, ih, ou, ee, oh)
    const vis = ["aa", "ih", "ou", "ee", "oh"];
    if (t >= 2.8 && t <= 4.8) { for (let i = 0; i < vis.length; i++) set(k, vis[i], bump(t, 2.9 + i * 0.38, 0.13)); }
    // surprised pop near 5.0
    set(k, "surprised", bump(t, 5.0, 0.12));
    // gentle head bob: yaw sine + small nod, as a quaternion (small-angle)
    const yaw = Math.sin(t * 0.9) * 0.10, pitch = Math.sin(t * 1.7) * 0.05;
    const qy = yaw / 2, qx = pitch / 2; // small-angle approx, combine
    rot[k * 4] = Math.sin(qx); rot[k * 4 + 1] = Math.sin(qy); rot[k * 4 + 2] = 0; rot[k * 4 + 3] = Math.cos(qx) * Math.cos(qy);
  }

  // append accessors to the BIN
  const chunks = [Buffer.from(bin)]; let off = bin.length;
  const addAcc = (arr, type, extra = {}) => {
    const p = pad4(off); if (p) { chunks.push(Buffer.alloc(p, 0)); off += p; }
    const buf = f32(arr); const bvIdx = json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length }) - 1;
    chunks.push(buf); off += buf.length;
    const comp = type === "SCALAR" ? 1 : type === "VEC4" ? 4 : 3;
    return json.accessors.push({ bufferView: bvIdx, componentType: 5126, count: arr.length / comp, type, ...extra }) - 1;
  };
  const tAcc = addAcc(times, "SCALAR", { min: [0], max: [times[K - 1]] });
  const wAcc = addAcc(weights, "SCALAR");
  const samplers = [{ input: tAcc, output: wAcc, interpolation: "LINEAR" }];
  const channels = [{ sampler: 0, target: { node: meshNode, path: "weights" } }];
  if (headNode != null) { const rAcc = addAcc(rot, "VEC4"); samplers.push({ input: tAcc, output: rAcc, interpolation: "LINEAR" }); channels.push({ sampler: 1, target: { node: headNode, path: "rotation" } }); }

  // REPLACE any existing (often static) animation so viewers play THIS demo
  json.animations = [{ name: opts.name || "MCProid_Demo", samplers, channels }];
  json.buffers[0].byteLength = Buffer.concat(chunks).length;
  // also set rest weights array length so viewers init correctly
  const mesh = json.meshes[json.nodes[meshNode].mesh]; mesh.weights = mesh.weights || new Array(T).fill(0);

  const moved = weights.some((w) => w > 0.01);
  return {
    buffer: writeGlb({ json, bin: Buffer.concat(chunks), version }),
    report: { keyframes: K, duration: dur, morphTracks: 1, boneTracks: headNode != null ? 1 : 0, animatesMorphs: moved, note: "Self-playing demo baked: blink, smile, a spoken viseme sentence, surprised, head bob." },
  };
}
