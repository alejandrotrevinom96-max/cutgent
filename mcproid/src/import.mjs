import { readGlb, writeGlb } from "./glb.mjs";
import { REQUIRED_BONES, REQUIRED_EXPRESSIONS } from "./contract.mjs";
import { detectSpec } from "./vrm.mjs";

// Import a generic rigged GLB (e.g. Higgsfield/Meshy image_to_3d with rigging) and
// wrap it as a VRM 1.0: map the body skeleton to the VRM humanoid, convert
// materials to MToon, and auto-add spring bones to hair/skirt chains. This is the
// "make it VRM, our tool does the rest" step — it does EVERYTHING except the facial
// rig (expressions/visemes), which the source mesh doesn't contain. The returned
// report names exactly what's still missing to be "living" (honest, no faking).

// Mixamo / Meshy / VRM-native bone names -> VRM humanoid bone (normalized lookup).
const BONE_MAP = {
  hips: "hips", spine: "spine", spine1: "chest", spine2: "upperChest", chest: "chest", upperchest: "upperChest",
  neck: "neck", head: "head",
  leftshoulder: "leftShoulder", leftarm: "leftUpperArm", leftforearm: "leftLowerArm", lefthand: "leftHand",
  rightshoulder: "rightShoulder", rightarm: "rightUpperArm", rightforearm: "rightLowerArm", righthand: "rightHand",
  leftupleg: "leftUpperLeg", leftleg: "leftLowerLeg", leftfoot: "leftFoot", lefttoebase: "leftToes",
  rightupleg: "rightUpperLeg", rightleg: "rightLowerLeg", rightfoot: "rightFoot", righttoebase: "rightToes",
  // accept VRM-native names directly too
  leftupperarm: "leftUpperArm", leftlowerarm: "leftLowerArm", leftupperleg: "leftUpperLeg", leftlowerleg: "leftLowerLeg",
  rightupperarm: "rightUpperArm", rightlowerarm: "rightLowerArm", rightupperleg: "rightUpperLeg", rightlowerleg: "rightLowerLeg",
};
const norm = (s) => String(s || "").toLowerCase().replace(/^mixamorig:?/, "").replace(/[^a-z0-9]/g, "");
const SPRING_RE = /hair|skirt|cloth|tail|ribbon|sleeve|coat|cape|ahoge/i;
const shade = (c) => [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7];

export function glbToLivingVrm(glbBuffer, spec = {}) {
  const { json, bin, version } = readGlb(glbBuffer);
  if (detectSpec(json)) throw new Error("already a VRM; use forge, not import");
  json.extensions = json.extensions || {};
  json.extensionsUsed = json.extensionsUsed || [];
  const use = (e) => { if (!json.extensionsUsed.includes(e)) json.extensionsUsed.push(e); };

  // 1) map skeleton -> VRM humanoid
  const humanBones = {};
  const mapped = [];
  (json.nodes || []).forEach((n, i) => {
    const vb = BONE_MAP[norm(n.name)];
    if (vb && !humanBones[vb]) { humanBones[vb] = { node: i }; mapped.push(vb); }
  });
  const missingBones = REQUIRED_BONES.filter((b) => !humanBones[b]);

  // 2) auto spring bones on hair/skirt/cloth chains
  const springJoints = [];
  (json.nodes || []).forEach((n, i) => { if (SPRING_RE.test(n.name || "")) springJoints.push({ node: i, hitRadius: 0.02, stiffness: 1.0, gravityPower: 0.2, gravityDir: [0, -1, 0], dragForce: 0.4 }); });
  if (springJoints.length) {
    json.extensions.VRMC_springBone = { specVersion: "1.0", colliders: [], colliderGroups: [], springs: [{ name: "auto", joints: springJoints }] };
    use("VRMC_springBone");
  }

  // 3) materials -> MToon
  for (const m of json.materials || []) {
    const base = (m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor) || [0.8, 0.8, 0.8, 1];
    m.extensions = m.extensions || {};
    m.extensions.VRMC_materials_mtoon = m.extensions.VRMC_materials_mtoon || { shadeColorFactor: shade(base) };
  }
  if ((json.materials || []).length) use("VRMC_materials_mtoon");

  // 4) VRMC_vrm core (expressions intentionally EMPTY — that's the facial-rig gap)
  json.extensions.VRMC_vrm = {
    specVersion: "1.0",
    meta: {
      name: spec.name || "imported avatar", version: "1.0", authors: [spec.author || "mcproid"],
      licenseUrl: (spec.license && spec.license.url) || "https://vrm.dev/licenses/1.0/",
      avatarPermission: (spec.license && spec.license.avatarPermission) || "onlyAuthor",
      commercialUsage: (spec.license && spec.license.commercialUsage) || "personalNonProfit",
    },
    humanoid: { humanBones },
    firstPerson: {}, lookAt: { type: "bone" },
    expressions: { preset: {}, custom: {} },
  };
  use("VRMC_vrm");
  json.asset = json.asset || {}; json.asset.generator = "mcproid/import";

  const report = {
    mappedBones: mapped.length,
    missingBones,
    springs: springJoints.length,
    mtoonMaterials: (json.materials || []).length,
    missingForLiving: [...REQUIRED_EXPRESSIONS], // no facial rig yet
    living: false,
    note: "Body VRM ready. Facial rig (expressions+visemes) must be added via a transfer/service step to become 'living'.",
  };
  return { buffer: writeGlb({ json, bin, version }), report };
}
