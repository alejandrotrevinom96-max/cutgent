#!/usr/bin/env node
// CLI: forge a living VRM (or a batch of variants) from a spec (+ optional base).
//   node bin/forge.mjs --spec specs/luna.json --base base.vrm --out out/luna.vrm
//   node bin/forge.mjs --spec specs/luna.json --cockpit            # write into atm-cockpit
//   node bin/forge.mjs --spec specs/luna.json --variants variants.json --outdir out/
// Flags: --require-commercial  --strict  --texture-mode multiply|hue  --manifest <path>
// Omit --base to use the built-in fixture base.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLivingAvatar } from "../src/forge.mjs";
import { forgeVariants } from "../src/variants.mjs";
import { buildFixtureVrm } from "../src/fixture.mjs";
import { validateLivingVrm } from "../src/validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (flag, def) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : def; };
const has = (flag) => process.argv.includes(flag);
const COCKPIT_VRM = resolve(here, "../../atm-cockpit/public/avatar.vrm");

const spec = JSON.parse(readFileSync(arg("--spec", resolve(here, "../specs/luna.json")), "utf8"));
if (has("--require-commercial")) spec.requireCommercial = true;
if (arg("--texture-mode", null)) spec.textureMode = arg("--texture-mode", "multiply");

const basePath = arg("--base", null);
const base = basePath ? readFileSync(basePath) : buildFixtureVrm();
if (!basePath) console.log("• no --base given: using built-in fixture base (provide your VRoid/CC0 base for the real look)");

// batch mode
const variantsPath = arg("--variants", null);
if (variantsPath) {
  const outdir = arg("--outdir", resolve(here, "../out"));
  mkdirSync(outdir, { recursive: true });
  const results = forgeVariants(base, spec, JSON.parse(readFileSync(variantsPath, "utf8")));
  let allOk = true;
  for (const r of results) {
    const p = resolve(outdir, `${r.name}.vrm`); writeFileSync(p, r.buffer);
    const { ok } = validateLivingVrm(r.buffer); allOk = allOk && ok;
    console.log(`  ${ok ? "✅" : "❌"} ${r.name} -> ${p} (${r.buffer.length}b) recolor=[${r.manifest.recolor.join(",")}]`);
  }
  console.log(allOk ? "\nALL VARIANTS VALID ✅" : "\nSOME VARIANTS INVALID ❌");
  process.exit(allOk ? 0 : 1);
}

// single mode
const outPath = has("--cockpit") ? COCKPIT_VRM : arg("--out", resolve(here, "../out/avatar.vrm"));
const { buffer, manifest } = createLivingAvatar(base, spec);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buffer);
if (arg("--manifest", null)) writeFileSync(arg("--manifest"), JSON.stringify(manifest, null, 2));

const { ok, checks } = validateLivingVrm(buffer, { strict: has("--strict") });
console.log(`\nforged: ${outPath}  (${buffer.length} bytes, base=${manifest.baseSpec})`);
console.log(`recolor: ${manifest.recolor.join(", ") || "none"} | tex: ${manifest.textures.join(", ") || "none"} | parts: ${manifest.parts.join(", ") || "none"}`);
console.log(`proportions: ${JSON.stringify(manifest.proportions)} | spring: ${manifest.springProfile} | license: ${manifest.license}`);
if (manifest.warnings.length) console.log(`warnings: ${manifest.warnings.join("; ")}`);
for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
console.log(ok ? "\nLIVING VRM: VALID ✅" : "\nLIVING VRM: INVALID ❌");
if (has("--cockpit")) console.log("→ wrote into atm-cockpit/public/avatar.vrm (run the cockpit to see her)");
process.exit(ok ? 0 : 1);
