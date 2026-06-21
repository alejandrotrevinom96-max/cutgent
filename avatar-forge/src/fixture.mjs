import { writeGlb } from "./glb.mjs";
import { REQUIRED_EXPRESSIONS, REQUIRED_BONES } from "./contract.mjs";

// A tiny, schema-correct "living" VRM used as the CI fixture AND as the default
// base when no real base is supplied. It carries the full living rig (skeleton,
// every expression + viseme + blink, one hair spring) and three recolorable
// materials (Hair / Iris / Outfit) so the forge pipeline can be exercised
// end-to-end WITHOUT shipping a heavyweight third-party asset. A real base
// (your VRoid export or a CC0 model) plugs in identically — same code path.
export function buildFixtureVrm() {
  const nodes = [];
  const humanBones = {};
  REQUIRED_BONES.forEach((bone, i) => {
    humanBones[bone] = { node: i };
    nodes.push({ name: bone, translation: [0, i * 0.1, 0] });
  });
  const hairNode = nodes.length;
  nodes.push({ name: "hairRoot", translation: [0, 1.6, 0] });

  const expressions = { preset: {}, custom: {} };
  for (const e of REQUIRED_EXPRESSIONS) {
    expressions.preset[e] = {
      morphTargetBinds: [], materialColorBinds: [], textureTransformBinds: [],
      isBinary: e === "blink", overrideBlink: "none", overrideLookAt: "none", overrideMouth: "none",
    };
  }

  const materials = [
    mat("Hair", [0.9, 0.9, 0.92, 1]),
    mat("Iris", [0.4, 0.4, 0.4, 1]),
    mat("Outfit", [0.5, 0.5, 0.5, 1]),
    mat("Skin", [1, 0.86, 0.78, 1]),
  ];

  const json = {
    asset: { version: "2.0", generator: "avatar-forge/fixture" },
    extensionsUsed: ["VRMC_vrm", "VRMC_springBone"],
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    materials,
    extensions: {
      VRMC_vrm: {
        specVersion: "1.0",
        meta: {
          name: "avatar-forge base", version: "1.0", authors: ["avatar-forge"],
          licenseUrl: "https://vrm.dev/licenses/1.0/",
          avatarPermission: "onlyAuthor", commercialUsage: "personalNonProfit",
        },
        humanoid: { humanBones },
        firstPerson: {},
        lookAt: { type: "bone" },
        expressions,
      },
      VRMC_springBone: {
        specVersion: "1.0",
        colliders: [], colliderGroups: [],
        springs: [{
          name: "hair",
          joints: [{ node: hairNode, hitRadius: 0.02, stiffness: 1.0, gravityPower: 0.0, gravityDir: [0, -1, 0], dragForce: 0.4 }],
        }],
      },
    },
  };
  return writeGlb({ json, bin: null });
}

function mat(name, baseColorFactor) {
  return { name, pbrMetallicRoughness: { baseColorFactor, metallicFactor: 0, roughnessFactor: 1 } };
}
