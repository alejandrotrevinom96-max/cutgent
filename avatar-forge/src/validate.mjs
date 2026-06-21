import { readGlb } from "./glb.mjs";
import { REQUIRED_EXPRESSIONS, REQUIRED_BONES, REQUIRE_SPRINGBONE } from "./contract.mjs";

// Validate that a VRM buffer is "living": correct VRM extension, a humanoid
// skeleton, the full expression/viseme/blink set, and spring-bone physics.
// Pure JSON inspection — no WebGL — so it runs headless in CI and is the GATE
// every forged avatar must pass before it can reach the cockpit.
export function validateLivingVrm(buf) {
  const checks = [];
  const add = (name, pass, detail = "") => checks.push({ name, pass: !!pass, detail });

  let json;
  try { json = readGlb(buf).json; } catch (e) { add("parses as GLB", false, e.message); return done(checks); }
  add("parses as GLB", true);

  const used = json.extensionsUsed || [];
  const vrm = json.extensions && json.extensions.VRMC_vrm;
  add("declares VRMC_vrm", used.includes("VRMC_vrm") && !!vrm);
  if (vrm) add("VRM specVersion 1.x", String(vrm.specVersion || "").startsWith("1."), vrm.specVersion);

  const bones = (vrm && vrm.humanoid && vrm.humanoid.humanBones) || {};
  const missingBones = REQUIRED_BONES.filter((b) => !bones[b] || typeof bones[b].node !== "number");
  add("humanoid skeleton complete", missingBones.length === 0,
    missingBones.length ? `missing: ${missingBones.join(", ")}` : `${REQUIRED_BONES.length} bones`);

  const preset = (vrm && vrm.expressions && vrm.expressions.preset) || {};
  const missingExpr = REQUIRED_EXPRESSIONS.filter((e) => !preset[e]);
  add("expressions + visemes + blink present", missingExpr.length === 0,
    missingExpr.length ? `missing: ${missingExpr.join(", ")}` : `${REQUIRED_EXPRESSIONS.length} presets`);

  const spring = json.extensions && json.extensions.VRMC_springBone;
  const springs = (spring && spring.springs) || [];
  add("spring-bone physics present", !REQUIRE_SPRINGBONE || (used.includes("VRMC_springBone") && springs.length > 0),
    `${springs.length} spring(s)`);

  add("has avatar metadata", !!(vrm && vrm.meta && vrm.meta.name), (vrm && vrm.meta && vrm.meta.name) || "");

  return done(checks);
}

function done(checks) {
  return { ok: checks.every((c) => c.pass), checks };
}
