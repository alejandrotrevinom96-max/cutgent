// Higgsfield-3D (Meshy) adapter. image_to_3d / multi_image_to_3d with
// enable_rigging produce a textured GLB with a HUMANOID BODY skeleton — but no
// facial blendshapes/visemes, and GLB not VRM. MCProid now HANDLES the GLB->VRM
// step itself (src/import.mjs glbToLivingVrm: skeleton->humanoid, MToon, auto
// spring bones). So the pipeline is: Higgsfield (geometry+body rig, via the
// generate_3d MCP at the orchestration layer) -> mcproid import -> VRM body base.
// The ONLY remaining gap to "living" is the facial rig (a transfer/service step).
export const higgsfieldAdapter = {
  id: "higgsfield-3d",
  describe() {
    return {
      requires: ["Higgsfield MCP (generate_3d) + credits", "source image(s) / turnaround"],
      produces: "VRM 1.0 BODY base (after mcproid import): humanoid rig + MToon + spring bones; facial rig still TODO",
      crossesAF8: "geometry + body rig + GLB->VRM done; facial rig (expressions/visemes) is the remaining step",
    };
  },
  available() { return false; }, // the generate_3d call + credits live at the orchestration layer, not in this module
  produceBase() {
    return { buffer: null, living: false, notes: "Generate the GLB via the Higgsfield generate_3d MCP (with credits), then run mcproid import_glb to get a VRM body base. Facial rig (expressions/visemes) still needs a transfer/service step before it's 'living'." };
  },
};
