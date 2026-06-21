// Higgsfield-3D (Meshy) adapter. image_to_3d / multi_image_to_3d with
// enable_rigging produce a textured GLB with a HUMANOID BODY skeleton and optional
// body animation clips — but no facial blendshapes/visemes and GLB (not VRM). So,
// honestly, it gets you geometry + body rig, NOT a living face. produceBase stays
// living:false until a GLB->VRM + facial-rig step is added. The actual call would
// go through the Higgsfield MCP (generate_3d) at the orchestration layer, not here.
export const higgsfieldAdapter = {
  id: "higgsfield-3d",
  describe() {
    return {
      requires: ["Higgsfield MCP (generate_3d)", "source image(s) / turnaround", "credits", "a GLB->VRM + facial-rig step"],
      produces: "textured GLB with a body skeleton (+ optional body animation); NO face blendshapes/visemes, not VRM",
      crossesAF8: "partially (geometry + body rig; not VRM, not the facial rig)",
    };
  },
  available() { return false; }, // requires the Higgsfield MCP + credits at the orchestration layer
  produceBase() {
    return { buffer: null, living: false, notes: "Yields a body-rigged GLB without a facial rig; needs GLB->VRM conversion + expression/viseme authoring to satisfy the living contract." };
  },
};
