// THE LIVING CONTRACT — the single source of truth for what makes a VRM
// "alive" enough for the cockpit to drive. atm-cockpit drives a VRM via
// vrm.expressionManager.setValue(<id>) and vrm.humanoid; these are exactly the
// ids it uses (see atm-cockpit/src/renderer/avatar/VrmStage.tsx and
// src/shared/affect/affect.mjs). avatar-forge GUARANTEES a forged VRM satisfies
// this contract, so anything it produces drops straight into the cockpit.

// Affect expressions the cockpit blends (VRM 1.0 standard preset names).
export const EXPRESSIONS = ["happy", "angry", "sad", "relaxed", "surprised", "neutral"];

// Mouth visemes for lip sync (VRM 1.0 standard preset names).
export const VISEMES = ["aa", "ih", "ou", "ee", "oh"];

// Extra presets the cockpit relies on.
export const EXTRAS = ["blink"];

// Every expression preset a "living" VRM must expose.
export const REQUIRED_EXPRESSIONS = [...EXPRESSIONS, ...VISEMES, ...EXTRAS];

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
