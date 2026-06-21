import { load, getMeta, getBones, getExpressions, getSpringCount } from "./vrm.mjs";
import { REQUIRED_EXPRESSIONS, DRIVABLE_REQUIRED, REQUIRED_BONES, REQUIRE_SPRINGBONE } from "./contract.mjs";

// Validate that a VRM buffer is "living": a recognized VRM (0.x or 1.0), a
// humanoid skeleton, the full expression/viseme/blink set that ACTUALLY drives
// something, and spring-bone physics. Pure JSON inspection — no WebGL — so it
// runs headless in CI and is the GATE every forged avatar must pass.
//   strict: also require the license to permit commercial use.
export function validateLivingVrm(buf, { strict = false } = {}) {
  const checks = [];
  const add = (name, pass, detail = "") => checks.push({ name, pass: !!pass, detail });

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

  const springs = getSpringCount(json);
  add("spring-bone physics present", !REQUIRE_SPRINGBONE || springs > 0, `${springs} spring(s)`);

  const meta = getMeta(json);
  add("has avatar metadata", !!meta.name, meta.name);
  if (strict) add("license permits commercial use", meta.commercial, meta.commercialUsage || "unknown");

  return done(checks);
}

function done(checks) {
  return { ok: checks.every((c) => c.pass), checks };
}
