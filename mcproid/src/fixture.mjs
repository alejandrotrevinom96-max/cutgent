import { writeGlb, readGlb } from "./glb.mjs";
import { REQUIRED_EXPRESSIONS, REQUIRED_BONES } from "./contract.mjs";
import { encodePng } from "./png.mjs";

// VRM 1.0 fixture with two optional, named mesh parts (Jacket, Glasses) in the
// scene — used to gate part toggling (show/hide), without new geometry.
export function buildFixtureWithParts() {
  const g = readGlb(buildFixtureVrm());
  const j = g.json;
  const jacket = j.nodes.length; j.nodes.push({ name: "Jacket" });
  const glasses = j.nodes.length; j.nodes.push({ name: "Glasses" });
  j.scenes[0].nodes.push(jacket, glasses);
  return writeGlb({ json: j, bin: g.bin });
}

// Schema-correct "living" VRMs used as CI fixtures AND as the default base when
// none is supplied. They carry the full living rig (skeleton, every expression +
// viseme + blink WITH binds so they're "drivable", one hair spring) and three
// recolorable MToon materials (Hair / Iris / Outfit). A real base (your VRoid
// export or a CC0 model) plugs into the SAME code path — that's the whole point.

// ---- VRM 1.0 fixture ----
export function buildFixtureVrm() {
  const nodes = [];
  const humanBones = {};
  REQUIRED_BONES.forEach((bone, i) => { humanBones[bone] = { node: i }; nodes.push({ name: bone, translation: [0, i * 0.1, 0] }); });
  const hairNode = nodes.length;
  nodes.push({ name: "hairRoot", translation: [0, 1.6, 0] });

  const expressions = { preset: {}, custom: {} };
  REQUIRED_EXPRESSIONS.forEach((e, i) => {
    expressions.preset[e] = {
      // a materialColorBind makes the preset actually drive something (no mesh needed)
      morphTargetBinds: [],
      materialColorBinds: [{ material: 2, type: "color", targetValue: [1, (i % 5) / 5, 0.5, 1] }],
      textureTransformBinds: [],
      isBinary: e === "blink", overrideBlink: "none", overrideLookAt: "none", overrideMouth: "none",
    };
  });

  const materials = [mtoon("Hair", [0.9, 0.9, 0.92, 1]), mtoon("Iris", [0.4, 0.4, 0.4, 1]), mtoon("Outfit", [0.5, 0.5, 0.5, 1]), mtoon("Skin", [1, 0.86, 0.78, 1])];

  const json = {
    asset: { version: "2.0", generator: "mcproid/fixture" },
    extensionsUsed: ["VRMC_vrm", "VRMC_springBone", "VRMC_materials_mtoon"],
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, materials,
    extensions: {
      VRMC_vrm: {
        specVersion: "1.0",
        meta: { name: "mcproid base", version: "1.0", authors: ["mcproid"], licenseUrl: "https://vrm.dev/licenses/1.0/", avatarPermission: "onlyAuthor", commercialUsage: "personalNonProfit", modification: "allowModification" },
        humanoid: { humanBones }, firstPerson: {}, lookAt: { type: "bone" }, expressions,
      },
      VRMC_springBone: { specVersion: "1.0", colliders: [], colliderGroups: [], springs: [{ name: "hair", joints: [{ node: hairNode, hitRadius: 0.02, stiffness: 1.0, gravityPower: 0.0, gravityDir: [0, -1, 0], dragForce: 0.4 }] }] },
    },
  };
  return writeGlb({ json, bin: null });
}

function mtoon(name, baseColorFactor) {
  return {
    name,
    pbrMetallicRoughness: { baseColorFactor, metallicFactor: 0, roughnessFactor: 1 },
    extensions: { VRMC_materials_mtoon: { shadeColorFactor: [baseColorFactor[0] * 0.7, baseColorFactor[1] * 0.7, baseColorFactor[2] * 0.7] } },
  };
}

// ---- VRM 0.x fixture (to prove dual-format support) ----
export function buildFixtureVrm0() {
  const nodes = [];
  const humanBones = [];
  REQUIRED_BONES.forEach((bone, i) => { humanBones.push({ bone, node: i }); nodes.push({ name: bone, translation: [0, i * 0.1, 0] }); });
  const hairNode = nodes.length;
  nodes.push({ name: "hairRoot", translation: [0, 1.6, 0] });

  // VRM0 standard presets + a custom "Surprised" group (VRM0 has no surprised preset)
  const presetMap = { neutral: "neutral", happy: "joy", angry: "angry", sad: "sorrow", relaxed: "fun", aa: "a", ih: "i", ou: "u", ee: "e", oh: "o", blink: "blink" };
  const blendShapeGroups = [];
  for (const [neutralName, vrm0Preset] of Object.entries(presetMap))
    blendShapeGroups.push({ name: neutralName, presetName: vrm0Preset, binds: [], materialValues: [{ materialName: "Outfit", propertyName: "_Color", targetValue: [1, 0.5, 0.5, 1] }], isBinary: vrm0Preset === "blink" });
  blendShapeGroups.push({ name: "Surprised", presetName: "unknown", binds: [], materialValues: [{ materialName: "Outfit", propertyName: "_Color", targetValue: [1, 1, 0.5, 1] }] });

  const materials = [pbr("Hair"), pbr("Iris"), pbr("Outfit"), pbr("Skin")];
  const materialProperties = ["Hair", "Iris", "Outfit", "Skin"].map((n) => ({ name: n, shader: "VRM/MToon", vectorProperties: { _Color: [0.8, 0.8, 0.8, 1], _ShadeColor: [0.5, 0.5, 0.5, 1] } }));

  const json = {
    asset: { version: "2.0", generator: "mcproid/fixture0" },
    extensionsUsed: ["VRM"], scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, materials,
    extensions: {
      VRM: {
        specVersion: "0.0",
        meta: { title: "mcproid base0", author: "mcproid", commercialUssageName: "Disallow", licenseName: "CC_BY_NC", otherLicenseUrl: "https://vrm.dev/licenses/0.0/" },
        humanoid: { humanBones },
        blendShapeMaster: { blendShapeGroups },
        secondaryAnimation: { boneGroups: [{ comment: "hair", stiffiness: 1.0, dragForce: 0.4, gravityPower: 0.0, bones: [hairNode] }], colliderGroups: [] },
        materialProperties,
      },
    },
  };
  return writeGlb({ json, bin: null });
}

function pbr(name) { return { name, pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1] } }; }

// ---- VRM 1.0 fixture WITH baked textures (Hair + Skin) in the BIN chunk ----
// Used to gate the texture-recolor path (decode -> tint -> re-encode -> repack).
export function buildFixtureVrmTextured() {
  const nodes = [];
  const humanBones = {};
  REQUIRED_BONES.forEach((bone, i) => { humanBones[bone] = { node: i }; nodes.push({ name: bone, translation: [0, i * 0.1, 0] }); });
  const hairNode = nodes.length; nodes.push({ name: "hairRoot", translation: [0, 1.6, 0] });

  const expressions = { preset: {}, custom: {} };
  REQUIRED_EXPRESSIONS.forEach((e, i) => {
    expressions.preset[e] = { morphTargetBinds: [], materialColorBinds: [{ material: 2, type: "color", targetValue: [1, (i % 5) / 5, 0.5, 1] }], textureTransformBinds: [], isBinary: e === "blink", overrideBlink: "none", overrideLookAt: "none", overrideMouth: "none" };
  });

  // two 4x4 RGBA gray textures (mid gray so a tint visibly shifts them)
  const gray = (n) => { const px = Buffer.alloc(n * n * 4, 128); for (let i = 3; i < px.length; i += 4) px[i] = 255; return encodePng({ width: n, height: n, bpp: 4, colorType: 6, pixels: px }); };
  const hairPng = gray(4), skinPng = gray(4);

  // pack the two PNGs into the BIN with 4-byte alignment
  const parts = []; const bufferViews = []; let off = 0;
  for (const png of [hairPng, skinPng]) {
    const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad, 0)); off += pad; }
    bufferViews.push({ buffer: 0, byteOffset: off, byteLength: png.length });
    parts.push(png); off += png.length;
  }
  const bin = Buffer.concat(parts);

  const materials = [
    { name: "Hair", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 } } },
    mtoon("Iris", [0.4, 0.4, 0.4, 1]),
    mtoon("Outfit", [0.5, 0.5, 0.5, 1]),
    { name: "Skin", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 1 } } },
  ];

  const json = {
    asset: { version: "2.0", generator: "mcproid/fixtureTextured" },
    extensionsUsed: ["VRMC_vrm", "VRMC_springBone", "VRMC_materials_mtoon"],
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, materials,
    buffers: [{ byteLength: bin.length }],
    bufferViews,
    images: [{ bufferView: 0, mimeType: "image/png" }, { bufferView: 1, mimeType: "image/png" }],
    textures: [{ source: 0 }, { source: 1 }],
    extensions: {
      VRMC_vrm: {
        specVersion: "1.0",
        meta: { name: "mcproid textured base", version: "1.0", authors: ["mcproid"], licenseUrl: "https://vrm.dev/licenses/1.0/", avatarPermission: "onlyAuthor", commercialUsage: "personalNonProfit", modification: "allowModification" },
        humanoid: { humanBones }, firstPerson: {}, lookAt: { type: "bone" }, expressions,
      },
      VRMC_springBone: { specVersion: "1.0", colliders: [], colliderGroups: [], springs: [{ name: "hair", joints: [{ node: hairNode, hitRadius: 0.02, stiffness: 1.0, gravityPower: 0.0, gravityDir: [0, -1, 0], dragForce: 0.4 }] }] },
    },
  };
  return writeGlb({ json, bin });
}
