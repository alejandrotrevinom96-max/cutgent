// avatar-forge selftest — the gate. Pure, headless, deterministic. Every piece
// of the pipeline is asserted here on BOTH VRM 0.x and 1.0; nothing ships unless
// this is ALL GREEN.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixtureVrm, buildFixtureVrm0, buildFixtureVrmTextured, buildFixtureWithParts } from "../src/fixture.mjs";
import { readGlb, writeGlb } from "../src/glb.mjs";
import { decodePng, encodePng, recolorPng } from "../src/png.mjs";
import { setParts, listParts } from "../src/mesh.mjs";
import { forgeVariants, expandMatrix } from "../src/variants.mjs";
import { listBases, pickBases, validateRegistry, verifyBase } from "../src/registry.mjs";
import { listAdapters, getAdapter } from "../src/adapters/index.mjs";
import { load, getMeta, getBones, getExpressions, getSpringCount, hexToRgba, SPRING_PROFILES } from "../src/vrm.mjs";
import { validateLivingVrm } from "../src/validate.mjs";
import { createLivingAvatar } from "../src/forge.mjs";
import { REQUIRED_EXPRESSIONS } from "../src/contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (name, cond, detail = "") => { const ok = !!cond; console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`); ok ? pass++ : fail++; };

const fx1 = buildFixtureVrm();
const fx0 = buildFixtureVrm0();
const spec = JSON.parse(readFileSync(resolve(here, "../specs/luna.json"), "utf8"));

// ---- codec ----
const a = readGlb(fx1);
const b = readGlb(writeGlb({ json: a.json, bin: a.bin }));
check("glb: JSON round-trips losslessly", JSON.stringify(a.json) === JSON.stringify(b.json));

// ---- dual-format detection ----
check("vrm: detects VRM 1.0", load(fx1).spec === "1.0");
check("vrm: detects VRM 0.x", load(fx0).spec === "0.x");

// ---- both fixtures are valid living VRMs ----
const v1 = validateLivingVrm(fx1); check("validate: VRM 1.0 fixture is living", v1.ok, v1.checks.filter((c) => !c.pass).map((c) => c.name).join(",") || "all pass");
const v0 = validateLivingVrm(fx0); check("validate: VRM 0.x fixture is living", v0.ok, v0.checks.filter((c) => !c.pass).map((c) => c.name).join(",") || "all pass");

// ---- normalized accessors agree across specs ----
check("vrm: bones normalized on both specs", getBones(fx1).has("hips") && getBones(fx0).has("leftHand"));
check("vrm: VRM0 Joy/Sorrow/Fun mapped to happy/sad/relaxed", ["happy", "sad", "relaxed", "surprised"].every((e) => getExpressions(fx0).has(e)));
check("vrm: drivability detected (binds present)", REQUIRED_EXPRESSIONS.filter((e) => e !== "neutral").every((e) => getExpressions(fx1).get(e).bound));
check("vrm: meta normalized (name) on both", getMeta(fx1).name === "avatar-forge base" && getMeta(fx0).name === "avatar-forge base0");
check("vrm: spring count on both", getSpringCount(fx1) === 1 && getSpringCount(fx0) === 1);

// ---- forge: VRM 1.0 (recolor + MToon shade + meta + proportions + springs) ----
const r1 = createLivingAvatar(fx1, spec);
check("forge(1.0): output still a valid living VRM", validateLivingVrm(r1.buffer).ok);
check("forge(1.0): recolored hair/iris/outfit", r1.manifest.recolor.length >= 3, r1.manifest.recolor.join(" | "));
const out1 = readGlb(r1.buffer).json;
const hair1 = out1.materials.find((m) => m.name.toLowerCase().includes("hair"));
const want = hexToRgba(spec.palette.hair);
check("forge(1.0): hair baseColorFactor == spec", want.every((x, i) => Math.abs(hair1.pbrMetallicRoughness.baseColorFactor[i] - x) < 1e-9));
check("forge(1.0): MToon shadeColorFactor recolored too", hair1.extensions.VRMC_materials_mtoon.shadeColorFactor[0] < want[0] + 1e-9 && hair1.extensions.VRMC_materials_mtoon.shadeColorFactor[0] > 0);
check("forge(1.0): meta.name stamped", out1.extensions.VRMC_vrm.meta.name === spec.name);
check("forge(1.0): proportions applied", r1.manifest.proportions && out1.nodes[0].scale, JSON.stringify(out1.nodes[0].scale || null));
check("forge(1.0): spring profile applied", r1.manifest.springProfile === spec.springProfile && out1.extensions.VRMC_springBone.springs[0].joints[0].stiffness === SPRING_PROFILES[spec.springProfile].stiffness);

// ---- forge: VRM 0.x (recolor hits materialProperties) ----
const r0 = createLivingAvatar(fx0, spec);
check("forge(0.x): output still a valid living VRM", validateLivingVrm(r0.buffer).ok);
const out0 = readGlb(r0.buffer).json;
const hp = out0.extensions.VRM.materialProperties.find((p) => p.name.toLowerCase().includes("hair"));
check("forge(0.x): VRM0 _Color recolored", hp && want.every((x, i) => Math.abs(hp.vectorProperties._Color[i] - x) < 1e-9));
check("forge(0.x): meta.title stamped", out0.extensions.VRM.meta.title === spec.name);

// ---- texture recolor (the technological ceiling: tint baked pixels) ----
const fxt = buildFixtureVrmTextured();
check("textured fixture: is a valid living VRM", validateLivingVrm(fxt).ok);
const rt = createLivingAvatar(fxt, spec);
check("forge(tex): output still a valid living VRM", validateLivingVrm(rt.buffer).ok);
check("forge(tex): tinted the hair texture", rt.manifest.textures.some((t) => /hair/i.test(t)), rt.manifest.textures.join(" | "));
{
  const j = readGlb(rt.buffer);
  const hairBv = j.json.bufferViews[j.json.images[0].bufferView];
  const skinBv = j.json.bufferViews[j.json.images[1].bufferView];
  const hairPx = decodePng(j.bin.subarray(hairBv.byteOffset, hairBv.byteOffset + hairBv.byteLength)).pixels;
  const skinPx = decodePng(j.bin.subarray(skinBv.byteOffset, skinBv.byteOffset + skinBv.byteLength)).pixels;
  const wantHair = hexToRgba(spec.palette.hair);
  // gray 128 tinted toward hair hex => ~128*factor; and changed from 128
  check("forge(tex): hair pixels shifted toward spec color",
    Math.abs(hairPx[0] - 128 * wantHair[0]) <= 2 && hairPx[0] !== 128,
    `R=${hairPx[0]} (want ~${Math.round(128 * wantHair[0])})`);
  // skin texture (not in palette) must survive the repack byte-for-byte (still gray)
  check("repack: untinted skin texture preserved", skinPx[0] === 128 && skinPx[1] === 128 && skinPx[2] === 128, `R=${skinPx[0]}`);
}

// ---- license guard ----
let threw = false;
try { createLivingAvatar(fx1, { ...spec, requireCommercial: true }); } catch { threw = true; }
check("license: refuses commercial forge from non-commercial base", threw);

// ---- negative tests ----
const noSpring = (() => { const j = readGlb(fx1).json; delete j.extensions.VRMC_springBone; return writeGlb({ json: j }); })();
check("validate: rejects VRM with no spring bones", !validateLivingVrm(noSpring).ok);
const unbound = (() => { const j = readGlb(fx1).json; j.extensions.VRMC_vrm.expressions.preset.happy.materialColorBinds = []; return writeGlb({ json: j }); })();
check("validate: rejects VRM with an undrivable required expression", !validateLivingVrm(unbound).ok);

// ---- HSV recolor (preserves shading; colorizes even a gray texture) ----
{
  const gray = (n) => { const px = Buffer.alloc(n * n * 4, 128); for (let i = 3; i < px.length; i += 4) px[i] = 255; return encodePng({ width: n, height: n, bpp: 4, colorType: 6, pixels: px }); };
  const hsv = decodePng(recolorPng(gray(2), "#7B4FA6", { mode: "hue", strength: 1 })).pixels;
  check("png(hsv): gray recolored toward purple hue (b>r>g), value preserved", hsv[2] > hsv[0] && hsv[0] > hsv[1] && hsv[0] !== 128, `rgb=${hsv[0]},${hsv[1]},${hsv[2]}`);
}

// ---- mesh part toggling (hide existing parts; no new geometry) ----
{
  const fp = readGlb(buildFixtureWithParts()).json;
  const jacketIdx = fp.nodes.findIndex((n) => n.name === "Jacket");
  check("parts: base exposes Jacket/Glasses", listParts(fp).includes("Jacket") && listParts(fp).includes("Glasses"));
  const res = setParts(fp, { Jacket: false });
  const out = writeGlb({ json: fp });
  check("parts: hiding Jacket detaches it from the scene", !fp.scenes[0].nodes.includes(jacketIdx) && res.applied.includes("Jacket:off"));
  check("parts: still a valid living VRM after toggle", validateLivingVrm(out).ok);
}

// ---- batch variants ----
{
  const vs = forgeVariants(fx1, spec, [{ name: "Luna-Red", palette: { hair: "#ff0000" } }, { name: "Luna-Green", palette: { hair: "#00ff00" } }]);
  const hairOf = (b) => readGlb(b).json.materials.find((m) => m.name.toLowerCase().includes("hair")).pbrMetallicRoughness.baseColorFactor;
  check("variants: forged 2 valid variants", vs.length === 2 && vs.every((v) => validateLivingVrm(v.buffer).ok));
  check("variants: each variant has its own hair color", hairOf(vs[0].buffer)[0] === 1 && hairOf(vs[1].buffer)[1] === 1, `${vs[0].name},${vs[1].name}`);
  const matrix = expandMatrix({ hair: ["#111111", "#222222"], outfit: ["#333333"] }, "Luna");
  check("variants: matrix expands to cartesian product", matrix.length === 2 && matrix.every((m) => m.palette.hair && m.palette.outfit));
}

// ---- license-aware base registry ----
{
  check("registry: schema valid", validateRegistry().ok, validateRegistry().errs.join(";"));
  const commercial = pickBases({ commercial: true }).map((b) => b.id);
  check("registry: commercial filter excludes the non-commercial fixture", !commercial.includes("fixture") && listBases().length >= 2, commercial.join(","));
  check("registry: verifyBase catches a license mismatch", verifyBase("your-vroid-export", fx1).ok === false, "claims commercial, fixture file is personalNonProfit");
}

// ---- AF8 adapters (honest seam: present but do not fake a living base here) ----
{
  const ad = listAdapters().map((a) => a.id);
  check("adapters: blender + higgsfield-3d registered", ad.includes("blender") && ad.includes("higgsfield-3d"), ad.join(","));
  check("adapters: none fabricates a living base in this env (honest)", listAdapters().every((a) => getAdapter(a.id).produceBase(spec).living === false));
}

// ---- contract linkage to the cockpit ----
const cockpitDrives = ["happy", "angry", "sad", "relaxed", "surprised", "neutral", "aa", "ih", "ou", "ee", "oh", "blink"];
check("contract: covers every id the cockpit drives", cockpitDrives.every((id) => REQUIRED_EXPRESSIONS.includes(id)), `${REQUIRED_EXPRESSIONS.length} presets`);

// ---- MCP layer ----
await mcpSmoke();

console.log(`\nAVATAR-FORGE SELFTEST: ${fail === 0 ? "ALL GREEN ✅" : fail + " FAILED ❌"}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);

function mcpSmoke() {
  return new Promise((res) => {
    const p = spawn(process.execPath, [resolve(here, "../src/mcp.mjs")]);
    let outBuf = "", listed = null, called = null, validated = null, done = false;
    const finish = () => {
      if (done) return; done = true; try { p.kill(); } catch { /* noop */ }
      check("mcp: tools/list exposes all 6 tools", listed === true, String(listed));
      check("mcp: tools/call create_living_avatar forges valid", called === true, String(called));
      check("mcp: tools/call validate_vrm works", validated === true, String(validated));
      res();
    };
    p.stdout.on("data", (d) => {
      outBuf += d.toString(); let nl;
      while ((nl = outBuf.indexOf("\n")) >= 0) {
        const line = outBuf.slice(0, nl); outBuf = outBuf.slice(nl + 1);
        if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 2) { const names = ((m.result && m.result.tools) || []).map((t) => t.name); listed = ["create_living_avatar", "validate_vrm", "inspect_vrm", "forge_variants", "list_bases", "list_adapters"].every((n) => names.includes(n)); }
        if (m.id === 3) called = !!(m.result && m.result.isError === false);
        if (m.id === 4) { validated = !!(m.result && m.result.isError === false); finish(); }
      }
    });
    p.on("error", () => finish());
    setTimeout(finish, 6000);
    const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "create_living_avatar", arguments: { spec } } });
    send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "validate_vrm", arguments: {} } });
  });
}
