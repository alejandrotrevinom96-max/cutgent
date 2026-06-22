import { readGlb } from "./glb.mjs";
import { detectSpec } from "./vrm.mjs";
import { glbToLivingVrm } from "./import.mjs";
import { riggFace } from "./face.mjs";
import { transferRig } from "./transfer.mjs";
import { addSprings } from "./springs.mjs";
import { validateLivingVrm } from "./validate.mjs";

// makeLivingAvatar — the ONE-SHOT MCProid pipeline. Input: a rigged GLB
// (Higgsfield/Meshy) or an existing VRM body. Steps: import -> facial rig
// (donor transfer if a donor is given, else procedural v3) -> spring physics
// (if hair bones exist) -> validate. Output: a living VRM + a report of how each
// stage went. This is the finished product entry point (CLI --make, MCP make_living_avatar).
export function makeLivingAvatar(inputBuffer, opts = {}) {
  const isVrm = !!detectSpec(readGlb(inputBuffer).json);
  const importedReport = isVrm ? null : (() => { return null; })();
  const body = isVrm ? inputBuffer : glbToLivingVrm(inputBuffer, opts.spec || {}).buffer;

  let faceBuf, faceMethod, faceReport;
  if (opts.donorBuffer) { const r = transferRig(body, opts.donorBuffer); faceBuf = r.buffer; faceMethod = "donor-transfer"; faceReport = r.report; }
  else { const r = riggFace(body, { front: opts.front }); faceBuf = r.buffer; faceMethod = "procedural-v3"; faceReport = r.report; }

  const sp = addSprings(faceBuf, { profile: opts.springProfile });
  const v = validateLivingVrm(sp.buffer, { strict: !!opts.strict });

  return {
    buffer: sp.buffer,
    report: {
      imported: !isVrm,
      faceMethod,
      face: faceReport,
      physics: sp.report,
      living: v.ok,
      hasPhysics: v.physics,
      checks: v.checks.map((c) => `${c.pass ? "OK" : "--"} ${c.name}${c.detail ? " (" + c.detail + ")" : ""}`),
    },
  };
}
