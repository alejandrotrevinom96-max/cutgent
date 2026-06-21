#!/usr/bin/env node
// CLI: forge a living VRM (or a batch of variants) from a spec (+ optional base).
//   node bin/forge.mjs --spec specs/luna.json --base base.vrm --out out/luna.vrm
//   node bin/forge.mjs --spec specs/luna.json --variants variants.json --outdir out/
// Flags: --require-commercial  --strict  --texture-mode multiply|hue  --manifest <path>
// Omit --base to use the built-in fixture base. --out can point at any VRM
// consumer's asset path (a web app's public/, a Unity StreamingAssets/, …).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLivingAvatar } from "../src/forge.mjs";
import { forgeVariants } from "../src/variants.mjs";
import { glbToLivingVrm } from "../src/import.mjs";
import { buildFixtureVrm } from "../src/fixture.mjs";
import { validateLivingVrm } from "../src/validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (flag, def) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : def; };
const has = (flag) => process.argv.includes(flag);

const spec = JSON.parse(readFileSync(arg("--spec", resolve(here, "../specs/luna.json")), "utf8"));
if (has("--require-commercial")) spec.requireCommercial = true;
if (arg("--texture-mode", null)) spec.textureMode = arg("--texture-mode", "multiply");

// import mode: convert a generic rigged GLB (Higgsfield/Meshy) into a VRM body base
const fromGlb = arg("--from-glb", null);
if (fromGlb) {
  const { buffer, report } = glbToLivingVrm(readFileSync(fromGlb), spec);
  const outPath = arg("--out", resolve(here, "../out/imported.vrm"));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buffer);
  console.log(`\nimported GLB -> VRM: ${outPath}  (${buffer.length} bytes)`);
  console.log(JSON.stringify(report, null, 2));
  console.log("\n→ body VRM ready. Next: add the facial rig (expressions/visemes) to make it 'living'.");
  process.exit(0);
}

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
const outPath = arg("--out", resolve(here, "../out/avatar.vrm"));
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
process.exit(ok ? 0 : 1);
