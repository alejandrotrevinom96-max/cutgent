// THE LIVING CONTRACT — MCProid's single source of truth for what makes a VRM
// "alive". These are the VRM 1.0 standard preset ids that any runtime drives via
// `vrm.expressionManager.setValue(<id>)` + `vrm.humanoid` (e.g. @pixiv/three-vrm
// in any web/Unity/engine app). MCProid GUARANTEES a forged VRM satisfies this,
// so its output loads in ANY VRM consumer — no specific app required.

// Emotion expressions (VRM 1.0 standard preset names).
export const EXPRESSIONS = ["happy", "angry", "sad", "relaxed", "surprised", "neutral"];

// Mouth visemes for lip sync (VRM 1.0 standard preset names).
export const VISEMES = ["aa", "ih", "ou", "ee", "oh"];

// Extra presets a live avatar relies on.
export const EXTRAS = ["blink"];

// Every expression preset a "living" VRM must expose.
export const REQUIRED_EXPRESSIONS = [...EXPRESSIONS, ...VISEMES, ...EXTRAS];

// Presets that must actually DRIVE something (have binds) to count as alive.
// 'neutral' is the rest pose and legitimately has no binds, so it's exempt.
export const DRIVABLE_REQUIRED = REQUIRED_EXPRESSIONS.filter((e) => e !== "neutral");

// Minimal humanoid skeleton (VRM 1.0 required human bones) for posing/animation.
export const REQUIRED_BONES = [
  "hips", "spine", "head",
  "leftUpperArm", "leftLowerArm", "leftHand",
  "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot",
  "rightUpperLeg", "rightLowerLeg", "rightFoot",
];

// Spring bones (hair/skirt physics) must be present — "fluid, not stiff".
export const REQUIRE_SPRINGBONE = true;
