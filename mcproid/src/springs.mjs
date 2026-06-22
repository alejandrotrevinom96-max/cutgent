import { readGlb, writeGlb } from "./glb.mjs";
import { detectSpec } from "./vrm.mjs";

// Add VRMC_springBone springs (hair/skirt sway) for bone chains the rig actually
// HAS. Authored bases (VRoid) carry hair/skirt bones -> real physics. A fused AI
// mesh (Meshy) has none -> this HONESTLY skips and says why, instead of faking
// non-functional springs. Reuses existing bone chains; never re-skins blindly.
const SPRING_RE = /hair|skirt|cloth|tail|ribbon|sleeve|coat|cape|ahoge|bang|ponytail|hime/i;
const PROFILES = { soft: { stiffness: 0.5, drag: 0.6, grav: 0.1 }, natural: { stiffness: 1, drag: 0.4, grav: 0.2 }, bouncy: { stiffness: 1.5, drag: 0.2, grav: 0.1 } };

export function addSprings(vrmBuffer, opts = {}) {
  const { json, bin, version } = readGlb(vrmBuffer);
  if (detectSpec(json) !== "1.0") throw new Error("addSprings expects a VRM 1.0");
  const nodes = json.nodes || [];
  const hairNodes = []; nodes.forEach((n, i) => { if (SPRING_RE.test(n.name || "")) hairNodes.push(i); });
  if (!hairNodes.length) return { buffer: vrmBuffer, report: { added: 0, skipped: true, reason: "no hair/skirt bones in this rig (fused mesh) — visible physics needs an authored base (e.g. VRoid)" } };

  json.extensions = json.extensions || {};
  const ext = (json.extensions.VRMC_springBone = json.extensions.VRMC_springBone || { specVersion: "1.0", colliders: [], colliderGroups: [], springs: [] });
  ext.springs = ext.springs || [];
  const p = PROFILES[opts.profile || "natural"];
  for (const n of hairNodes) ext.springs.push({ name: "auto_" + (nodes[n].name || n), joints: [{ node: n, hitRadius: 0.02, stiffness: p.stiffness, gravityPower: p.grav, gravityDir: [0, -1, 0], dragForce: p.drag }] });
  json.extensionsUsed = json.extensionsUsed || [];
  if (!json.extensionsUsed.includes("VRMC_springBone")) json.extensionsUsed.push("VRMC_springBone");
  return { buffer: writeGlb({ json, bin, version }), report: { added: hairNodes.length, skipped: false, bones: hairNodes.map((i) => nodes[i].name) } };
}
