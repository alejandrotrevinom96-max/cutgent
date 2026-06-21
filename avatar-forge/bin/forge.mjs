#!/usr/bin/env node
// CLI: forge a living VRM from a spec (+ optional base). Repeatable by design.
//   node bin/forge.mjs --spec specs/luna.json --base base.vrm --out out/luna.vrm
// Flags: --require-commercial  --strict  --manifest <path>
// Omit --base to use the built-in fixture base.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLivingAvatar } from "../src/forge.mjs";
import { buildFixtureVrm } from "../src/fixture.mjs";
import { validateLivingVrm } from "../src/validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (flag, def) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : def; };
const has = (flag) => process.argv.includes(flag);

const specPath = arg("--spec", resolve(here, "../specs/luna.json"));
const basePath = arg("--base", null);
const outPath = arg("--out", resolve(here, "../out/avatar.vrm"));
const manifestPath = arg("--manifest", null);

const spec = JSON.parse(readFileSync(specPath, "utf8"));
if (has("--require-commercial")) spec.requireCommercial = true;
const base = basePath ? readFileSync(basePath) : buildFixtureVrm();
if (!basePath) console.log("• no --base given: using built-in fixture base (provide your VRoid/CC0 base for the real look)");

const { buffer, manifest } = createLivingAvatar(base, spec);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buffer);
if (manifestPath) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const { ok, checks } = validateLivingVrm(buffer, { strict: has("--strict") });
console.log(`\nforged: ${outPath}  (${buffer.length} bytes, base=${manifest.baseSpec})`);
console.log(`recolor: ${manifest.recolor.join(", ") || "none"}  |  proportions: ${JSON.stringify(manifest.proportions)}  |  spring: ${manifest.springProfile}  |  license: ${manifest.license}`);
if (manifest.warnings.length) console.log(`warnings: ${manifest.warnings.join("; ")}`);
for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
console.log(ok ? "\nLIVING VRM: VALID ✅" : "\nLIVING VRM: INVALID ❌");
process.exit(ok ? 0 : 1);
