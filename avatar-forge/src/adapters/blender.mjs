import { execSync } from "node:child_process";

// Blender (headless) adapter. Blender + the VRM add-on CAN export a VRM with a
// humanoid rig and spring bones via Python — but authoring the STYLIZED FACIAL
// blendshapes (expressions + visemes) from arbitrary geometry is the unsolved part
// (AF8). So this adapter is honest: it reports requirements and does not fabricate
// a "living" base. Wire produceBase() to a real bpy script once that step exists.
export const blenderAdapter = {
  id: "blender",
  describe() {
    return {
      requires: ["blender (headless)", "VRM add-on for Blender", "a base mesh", "a face-rig authoring step for expressions/visemes"],
      produces: "VRM with humanoid rig + spring bones (NOT facial expressions/visemes automatically)",
      crossesAF8: "partially (geometry + body rig; not the stylized facial rig)",
    };
  },
  available() {
    try { execSync("blender --version", { stdio: "ignore" }); return true; } catch { return false; }
  },
  produceBase() {
    return { buffer: null, living: false, notes: this.available()
      ? "Blender present, but no facial-rig authoring step is implemented; would yield a non-living base. Not faking it."
      : "Blender not installed in this environment; cannot run the headless pipeline here." };
  },
};
