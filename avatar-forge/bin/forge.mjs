#!/usr/bin/env node
// CLI: forge a living VRM from a spec (+ optional base). Repeatable by design.
//   node bin/forge.mjs --spec specs/luna.json --base base.vrm --out out/luna.vrm
// Omit --base to use the built-in fixture base.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLivingAvatar } from "../src/forge.mjs";
import { buildFixtureVrm } from "../src/fixture.mjs";
import { validateLivingVrm } from "../src/validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (flag, def) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : def; };

const specPath = arg("--spec", resolve(here, "../specs/luna.json"));
const basePath = arg("--base", null);
const outPath = arg("--out", resolve(here, "../out/avatar.vrm"));

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const base = basePath ? readFileSync(basePath) : buildFixtureVrm();
if (!basePath) console.log("• no --base given: using built-in fixture base (provide your VRoid/CC0 base for the real look)");

const { buffer, applied } = createLivingAvatar(base, spec);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buffer);

const { ok, checks } = validateLivingVrm(buffer);
console.log(`\nforged: ${outPath}  (${buffer.length} bytes)`);
console.log(`recolor: ${applied.join(", ") || "none"}`);
for (const c of checks) console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
console.log(ok ? "\nLIVING VRM: VALID ✅" : "\nLIVING VRM: INVALID ❌");
process.exit(ok ? 0 : 1);
