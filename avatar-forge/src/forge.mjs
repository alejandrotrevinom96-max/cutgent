import { readGlb, writeGlb } from "./glb.mjs";

// createLivingAvatar — the core pipeline. Takes a "living" base VRM (its rig is
// REUSED, never rebuilt — that's the whole thesis: don't reinvent the hard part)
// plus a design spec, and returns a new VRM with the design applied: palette
// recolor + identity/license metadata. Geometry and the living rig pass through
// untouched, so the output is still drivable by the cockpit.
export function createLivingAvatar(baseBuffer, spec = {}) {
  const { json, bin, version } = readGlb(baseBuffer);
  const vrm = json.extensions && json.extensions.VRMC_vrm;
  if (!vrm) throw new Error("base is not a VRM 1.0 (no VRMC_vrm extension)");

  // 1) identity + license metadata
  vrm.meta = vrm.meta || {};
  if (spec.name) vrm.meta.name = spec.name;
  if (spec.author) vrm.meta.authors = [spec.author];
  if (spec.license) {
    if (spec.license.commercialUsage) vrm.meta.commercialUsage = spec.license.commercialUsage;
    if (spec.license.avatarPermission) vrm.meta.avatarPermission = spec.license.avatarPermission;
    if (spec.license.url) vrm.meta.licenseUrl = spec.license.url;
  }

  // 2) palette recolor — map spec.palette keys onto material names
  //    (case-insensitive substring). Edits baseColorFactor; texture-based
  //    recolor is a roadmap item (needs the base's texture atlas).
  const applied = [];
  const palette = spec.palette || {};
  for (const m of json.materials || []) {
    for (const [key, hex] of Object.entries(palette)) {
      if ((m.name || "").toLowerCase().includes(key.toLowerCase())) {
        m.pbrMetallicRoughness = m.pbrMetallicRoughness || {};
        m.pbrMetallicRoughness.baseColorFactor = hexToRgba(hex);
        applied.push(`${m.name}<-${key}:${hex}`);
      }
    }
  }

  json.asset = json.asset || {};
  json.asset.generator = "avatar-forge";
  return { buffer: writeGlb({ json, bin, version }), applied };
}

export function hexToRgba(hex) {
  const h = String(hex).replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}
