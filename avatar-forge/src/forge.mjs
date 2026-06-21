import { load, getMeta, recolorByName, scaleHeight, tuneSprings, writeGlb } from "./vrm.mjs";

// createLivingAvatar — the core pipeline. Takes a "living" base VRM (0.x or 1.0;
// its rig is REUSED, never rebuilt — that's the thesis) plus a design spec, and
// returns a new VRM with the design applied: palette recolor (PBR + MToon shade),
// proportions, spring-physics profile, and identity/license metadata. Geometry
// and the living rig pass through untouched, so the output stays cockpit-drivable.
// Returns { buffer, manifest } — the manifest is the reproducible record of edits.
export function createLivingAvatar(baseBuffer, spec = {}) {
  const { json, bin, version, spec: vspec } = load(baseBuffer);
  if (!vspec) throw new Error("base is not a VRM (no VRMC_vrm / VRM extension)");

  const manifest = { baseSpec: vspec, name: spec.name || null, recolor: [], proportions: null, springProfile: null, license: null, warnings: [] };

  // license guard — refuse to forge a commercial avatar from a base that forbids it
  const baseMeta = getMeta(json);
  if (spec.requireCommercial && !baseMeta.commercial)
    throw new Error(`base license forbids commercial use (commercialUsage=${baseMeta.commercialUsage || "unknown"})`);
  if (spec.requireCommercial && !baseMeta.allowModify)
    throw new Error("base license forbids modification");

  applyMeta(json, vspec, spec);
  manifest.license = getMeta(json).commercialUsage || null;

  if (spec.palette) manifest.recolor = recolorByName(json, spec.palette);

  if (spec.proportions && spec.proportions.height) {
    const ok = scaleHeight(json, spec.proportions.height);
    if (ok) manifest.proportions = spec.proportions; else manifest.warnings.push("no hips bone to scale");
  }

  if (spec.springProfile) {
    const ok = tuneSprings(json, spec.springProfile);
    if (ok) manifest.springProfile = spec.springProfile; else manifest.warnings.push(`no springs to tune / unknown profile '${spec.springProfile}'`);
  }

  json.asset = json.asset || {};
  json.asset.generator = "avatar-forge";
  return { buffer: writeGlb({ json, bin, version }), manifest, applied: manifest.recolor };
}

function applyMeta(json, vspec, spec) {
  if (vspec === "1.0") {
    const m = (json.extensions.VRMC_vrm.meta = json.extensions.VRMC_vrm.meta || {});
    if (spec.name) m.name = spec.name;
    if (spec.author) m.authors = [spec.author];
    if (spec.license) {
      if (spec.license.commercialUsage) m.commercialUsage = spec.license.commercialUsage;
      if (spec.license.avatarPermission) m.avatarPermission = spec.license.avatarPermission;
      if (spec.license.modification) m.modification = spec.license.modification;
      if (spec.license.url) m.licenseUrl = spec.license.url;
    }
  } else {
    const m = (json.extensions.VRM.meta = json.extensions.VRM.meta || {});
    if (spec.name) m.title = spec.name;
    if (spec.author) m.author = spec.author;
    if (spec.license && spec.license.commercialUsage)
      m.commercialUssageName = (spec.license.commercialUsage !== "personalNonProfit") ? "Allow" : "Disallow";
    if (spec.license && spec.license.url) m.otherLicenseUrl = spec.license.url;
  }
}
