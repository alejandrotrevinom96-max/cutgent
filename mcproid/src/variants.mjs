import { createLivingAvatar } from "./forge.mjs";

// Forge a whole matrix of avatars from one base in one call — the repeatable,
// commercial use case (palette variants, named editions, …). Each variant is a
// partial spec patch merged over the base spec (palette is deep-merged).
export function forgeVariants(baseBuffer, baseSpec, variants) {
  if (!Array.isArray(variants) || !variants.length) throw new Error("variants must be a non-empty array");
  return variants.map((v, i) => {
    const spec = {
      ...baseSpec, ...v,
      name: v.name || `${baseSpec.name || "avatar"}-${i + 1}`,
      palette: { ...(baseSpec.palette || {}), ...(v.palette || {}) },
    };
    const { buffer, manifest } = createLivingAvatar(baseBuffer, spec);
    return { name: spec.name, buffer, manifest };
  });
}

// Expand a palette matrix ({ hair:[a,b], outfit:[c] }) into the cartesian product
// of variant specs, so an agent can ask for "every hair × outfit combination".
export function expandMatrix(matrix, baseName = "avatar") {
  const keys = Object.keys(matrix);
  let combos = [{}];
  for (const k of keys) combos = combos.flatMap((c) => matrix[k].map((val) => ({ ...c, [k]: val })));
  return combos.map((c, i) => ({ name: `${baseName}-${i + 1}`, palette: c }));
}
