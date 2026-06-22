import { load, getMeta, getBones, getExpressions, getSpringCount } from "./vrm.mjs";
import { REQUIRED_EXPRESSIONS, DRIVABLE_REQUIRED, REQUIRED_BONES, REQUIRE_SPRINGBONE } from "./contract.mjs";

// Validate that a VRM is "living": a recognized VRM (0.x or 1.0), a humanoid
// skeleton, and the full expression/viseme/blink set that ACTUALLY drives something
// — i.e. it can emote, talk and animate. Spring-bone PHYSICS (hair/skirt sway) is a
// separate quality flag, NOT part of the "living" verdict: it requires hair bones,
// which authored bases (VRoid) have and fused AI meshes (Meshy) lack. Pure JSON,
// headless. `ok` = living (drivable); `physics` = hair/skirt sway present.
//   strict: also require the license to permit commercial use.
export function validateLivingVrm(buf, { strict = false } = {}) {
  const checks = [];
  const add = (name, pass, detail = "", physics = false) => checks.push({ name, pass: !!pass, detail, physics });

  let json, spec;
  try { const g = load(buf); json = g.json; spec = g.spec; }
  catch (e) { add("parses as GLB", false, e.message); return done(checks); }
  add("parses as GLB", true);
  add("is a VRM (0.x or 1.0)", !!spec, spec || "none");
  if (!spec) return done(checks);

  const bones = getBones(json);
  const missB = REQUIRED_BONES.filter((b) => !bones.has(b));
  add("humanoid skeleton complete", missB.length === 0, missB.length ? `missing: ${missB.join(", ")}` : `${bones.size} bones`);

  const expr = getExpressions(json);
  const missE = REQUIRED_EXPRESSIONS.filter((e) => !expr.has(e));
  add("expressions + visemes + blink present", missE.length === 0, missE.length ? `missing: ${missE.join(", ")}` : `${REQUIRED_EXPRESSIONS.length} presets`);

  const unbound = DRIVABLE_REQUIRED.filter((e) => expr.has(e) && !expr.get(e).bound);
  add("required expressions are drivable (have binds)", unbound.length === 0, unbound.length ? `unbound: ${unbound.join(", ")}` : "all bound");

  const meta = getMeta(json);
  add("has avatar metadata", !!meta.name, meta.name);
  if (strict) add("license permits commercial use", meta.commercial, meta.commercialUsage || "unknown");

  // physics — reported, but does NOT block the "living" verdict (needs hair bones)
  const springs = getSpringCount(json);
  add("spring-bone physics (hair/skirt sway)", !REQUIRE_SPRINGBONE || springs > 0, `${springs} spring(s)`, true);

  return done(checks);
}

function done(checks) {
  const living = checks.filter((c) => !c.physics);
  return { ok: living.every((c) => c.pass), physics: (checks.find((c) => c.physics) || {}).pass === true, checks };
}
