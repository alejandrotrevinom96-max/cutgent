// Unified accessor over VRM 0.x and VRM 1.0 so every mcproid feature works
// on real-world bases regardless of version. It speaks a NEUTRAL model (VRM 1.0
// preset names + a normalized license); VRM 0.x is mapped on the way in/out
// (Joy/Sorrow/Fun -> happy/sad/relaxed, extensions.VRM -> VRMC_vrm, etc.).
import { readGlb, writeGlb } from "./glb.mjs";
import { REQUIRED_EXPRESSIONS } from "./contract.mjs";

export { writeGlb };

// VRM 0.x preset (lowercased) -> neutral (VRM 1.0) expression name.
export const VRM0_TO_NEUTRAL = {
  neutral: "neutral", joy: "happy", angry: "angry", sorrow: "sad", fun: "relaxed",
  a: "aa", i: "ih", u: "ou", e: "ee", o: "oh",
  blink: "blink", blink_l: "blinkLeft", blink_r: "blinkRight",
  lookup: "lookUp", lookdown: "lookDown", lookleft: "lookLeft", lookright: "lookRight",
};
const NEUTRAL_NAMES = new Set([...REQUIRED_EXPRESSIONS, "blinkLeft", "blinkRight", "lookUp", "lookDown", "lookLeft", "lookRight"]);

// Read accessors accept either a parsed glTF json or a raw .vrm Buffer.
const J = (x) => (Buffer.isBuffer(x) ? readGlb(x).json : x);

export function detectSpec(jsonOrBuf) {
  const json = J(jsonOrBuf);
  const e = json.extensions || {};
  if (e.VRMC_vrm) return "1.0";
  if (e.VRM) return "0.x";
  return null;
}

export function load(buf) {
  const g = readGlb(buf);
  return { ...g, spec: detectSpec(g.json) };
}

export function hexToRgba(hex) {
  const h = String(hex).replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}
const shade = (rgba) => [rgba[0] * 0.7, rgba[1] * 0.7, rgba[2] * 0.7, rgba[3]];

// --- normalized metadata ---
export function getMeta(jsonOrBuf) {
  const json = J(jsonOrBuf);
  const spec = detectSpec(json);
  if (spec === "1.0") {
    const m = json.extensions.VRMC_vrm.meta || {};
    return {
      spec, name: m.name || "", authors: m.authors || [],
      commercialUsage: m.commercialUsage || "",
      commercial: !!m.commercialUsage && m.commercialUsage !== "personalNonProfit",
      allowModify: (m.modification || "allowModification") !== "prohibited",
      licenseUrl: m.licenseUrl || "",
    };
  }
  if (spec === "0.x") {
    const m = json.extensions.VRM.meta || {};
    const cu = m.commercialUssageName || m.commercialUsageName || "";
    return {
      spec, name: m.title || "", authors: m.author ? [m.author] : [],
      commercialUsage: cu, commercial: /allow/i.test(cu),
      allowModify: true, licenseUrl: m.otherLicenseUrl || m.licenseName || "",
    };
  }
  return { spec: null, name: "", authors: [], commercial: false, allowModify: false };
}

// --- humanoid bones (neutral Unity names; same in both specs) ---
export function getBoneNodeMap(jsonOrBuf) {
  const json = J(jsonOrBuf);
  const spec = detectSpec(json);
  const map = new Map();
  if (spec === "1.0") {
    const hb = (json.extensions.VRMC_vrm.humanoid && json.extensions.VRMC_vrm.humanoid.humanBones) || {};
    for (const [k, v] of Object.entries(hb)) if (v && typeof v.node === "number") map.set(k, v.node);
  } else if (spec === "0.x") {
    const arr = (json.extensions.VRM.humanoid && json.extensions.VRM.humanoid.humanBones) || [];
    for (const b of arr) if (b && typeof b.node === "number") map.set(b.bone, b.node);
  }
  return map;
}
export const getBones = (json) => new Set(getBoneNodeMap(json).keys());

// --- expressions (neutral names) with drivability (does it actually bind anything?) ---
export function getExpressions(jsonOrBuf) {
  const json = J(jsonOrBuf);
  const spec = detectSpec(json);
  const map = new Map();
  if (spec === "1.0") {
    const preset = (json.extensions.VRMC_vrm.expressions && json.extensions.VRMC_vrm.expressions.preset) || {};
    for (const [name, e] of Object.entries(preset)) {
      const bound = ((e.morphTargetBinds || []).length + (e.materialColorBinds || []).length + (e.textureTransformBinds || []).length) > 0;
      map.set(name, { bound });
    }
  } else if (spec === "0.x") {
    const groups = (json.extensions.VRM.blendShapeMaster && json.extensions.VRM.blendShapeMaster.blendShapeGroups) || [];
    for (const g of groups) {
      const preset = (g.presetName || "").toLowerCase();
      const byName = (g.name || "").toLowerCase();
      const name = (preset && preset !== "unknown" && VRM0_TO_NEUTRAL[preset]) ||
        (NEUTRAL_NAMES.has(byName) ? byName : null);
      if (!name) continue;
      const bound = ((g.binds || []).length + (g.materialValues || []).length) > 0;
      map.set(name, { bound });
    }
  }
  return map;
}

// --- spring bones ---
export function getSpringCount(jsonOrBuf) {
  const json = J(jsonOrBuf);
  const spec = detectSpec(json);
  if (spec === "1.0") return ((json.extensions.VRMC_springBone && json.extensions.VRMC_springBone.springs) || []).length;
  if (spec === "0.x") return ((json.extensions.VRM.secondaryAnimation && json.extensions.VRM.secondaryAnimation.boneGroups) || []).length;
  return 0;
}

// --- mutations (work on both specs) ---
export function recolorByName(json, palette) {
  const spec = detectSpec(json);
  const applied = [];
  const mats = json.materials || [];
  const vrm0props = spec === "0.x" ? ((json.extensions.VRM && json.extensions.VRM.materialProperties) || []) : null;
  mats.forEach((m, idx) => {
    const mname = (m.name || "").toLowerCase();
    for (const [key, hex] of Object.entries(palette)) {
      if (!mname.includes(key.toLowerCase())) continue;
      const rgba = hexToRgba(hex);
      m.pbrMetallicRoughness = m.pbrMetallicRoughness || {};
      m.pbrMetallicRoughness.baseColorFactor = rgba;
      if (spec === "1.0") {
        m.extensions = m.extensions || {};
        if (m.extensions.VRMC_materials_mtoon) m.extensions.VRMC_materials_mtoon.shadeColorFactor = shade(rgba);
      } else if (vrm0props) {
        const mp = vrm0props.find((p) => (p.name || "").toLowerCase() === (m.name || "").toLowerCase()) || vrm0props[idx];
        if (mp) { mp.vectorProperties = mp.vectorProperties || {}; mp.vectorProperties._Color = rgba; mp.vectorProperties._ShadeColor = shade(rgba); }
      }
      applied.push(`${m.name || "mat" + idx}<-${key}:${hex}`);
    }
  });
  return applied;
}

export function scaleHeight(json, factor) {
  const hips = getBoneNodeMap(json).get("hips");
  if (hips == null || !json.nodes || !json.nodes[hips]) return false;
  const n = json.nodes[hips];
  const s = n.scale || [1, 1, 1];
  n.scale = [s[0] * factor, s[1] * factor, s[2] * factor];
  return true;
}

export const SPRING_PROFILES = {
  soft: { stiffness: 0.5, dragForce: 0.6, gravityPower: 0.1 },
  natural: { stiffness: 1.0, dragForce: 0.4, gravityPower: 0.2 },
  bouncy: { stiffness: 1.5, dragForce: 0.2, gravityPower: 0.1 },
};
export function tuneSprings(json, profileName) {
  const p = SPRING_PROFILES[profileName];
  if (!p) return false;
  const spec = detectSpec(json);
  let touched = 0;
  if (spec === "1.0") {
    for (const s of (json.extensions.VRMC_springBone && json.extensions.VRMC_springBone.springs) || [])
      for (const j of s.joints || []) { j.stiffness = p.stiffness; j.dragForce = p.dragForce; j.gravityPower = p.gravityPower; touched++; }
  } else if (spec === "0.x") {
    for (const g of (json.extensions.VRM.secondaryAnimation && json.extensions.VRM.secondaryAnimation.boneGroups) || [])
      { g.stiffiness = p.stiffness; g.dragForce = p.dragForce; g.gravityPower = p.gravityPower; touched++; } // VRM0 spells it "stiffiness"
  }
  return touched > 0;
}
