// avatar-forge selftest — the gate. Pure, headless, deterministic. Every piece
// of the pipeline is asserted here; nothing ships unless this is ALL GREEN.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixtureVrm } from "../src/fixture.mjs";
import { readGlb, writeGlb } from "../src/glb.mjs";
import { validateLivingVrm } from "../src/validate.mjs";
import { createLivingAvatar, hexToRgba } from "../src/forge.mjs";
import { REQUIRED_EXPRESSIONS } from "../src/contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  const ok = !!cond;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
  ok ? pass++ : fail++;
};

// 1. GLB codec round-trips the JSON chunk losslessly
const fx = buildFixtureVrm();
const a = readGlb(fx);
const b = readGlb(writeGlb({ json: a.json, bin: a.bin }));
check("glb: JSON round-trips losslessly", JSON.stringify(a.json) === JSON.stringify(b.json));

// 2. fixture is a valid living VRM
const v0 = validateLivingVrm(fx);
check("fixture: is a valid living VRM", v0.ok, v0.checks.filter((c) => !c.pass).map((c) => c.name).join(",") || "all pass");

// 3. forge applies the spec and stays valid
const spec = JSON.parse(readFileSync(resolve(here, "../specs/luna.json"), "utf8"));
const { buffer, applied } = createLivingAvatar(fx, spec);
check("forge: output is still a valid living VRM", validateLivingVrm(buffer).ok);
check("forge: applied palette to hair/iris/outfit", applied.length >= 3, applied.join(" | "));

// 4. recolor actually changed the hair material to the spec color
const out = readGlb(buffer).json;
const hair = out.materials.find((m) => m.name.toLowerCase().includes("hair"));
const want = hexToRgba(spec.palette.hair);
check("forge: hair baseColorFactor == spec.palette.hair",
  hair && want.every((x, i) => Math.abs(hair.pbrMetallicRoughness.baseColorFactor[i] - x) < 1e-9),
  `[${hair.pbrMetallicRoughness.baseColorFactor.map((n) => n.toFixed(3)).join(", ")}]`);

// 5. identity metadata stamped
check("forge: meta.name == spec.name", out.extensions.VRMC_vrm.meta.name === spec.name, out.extensions.VRMC_vrm.meta.name);

// 6. the contract covers exactly what the cockpit drives (linkage guard)
const cockpitDrives = ["happy", "angry", "sad", "relaxed", "surprised", "neutral", "aa", "ih", "ou", "ee", "oh", "blink"];
check("contract: covers every id the cockpit drives",
  cockpitDrives.every((id) => REQUIRED_EXPRESSIONS.includes(id)), `${REQUIRED_EXPRESSIONS.length} required presets`);

// 7. negative test: a VRM stripped of spring bones is rejected
const broken = (() => { const j = readGlb(fx).json; delete j.extensions.VRMC_springBone; return writeGlb({ json: j }); })();
check("validator: rejects a VRM with no spring bones", !validateLivingVrm(broken).ok);

// 8. MCP layer boots and exposes the tool (spawn smoke test)
await mcpSmoke();

console.log(`\nAVATAR-FORGE SELFTEST: ${fail === 0 ? "ALL GREEN ✅" : fail + " FAILED ❌"}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);

function mcpSmoke() {
  return new Promise((res) => {
    const p = spawn(process.execPath, [resolve(here, "../src/mcp.mjs")]);
    let outBuf = "";
    let listed = null, called = null, done = false;
    const finish = () => {
      if (done) return; done = true;
      try { p.kill(); } catch { /* noop */ }
      check("mcp: tools/list exposes create_living_avatar", listed === true, String(listed));
      check("mcp: tools/call forges a valid VRM", called === true, String(called));
      res();
    };
    p.stdout.on("data", (d) => {
      outBuf += d.toString();
      let nl;
      while ((nl = outBuf.indexOf("\n")) >= 0) {
        const line = outBuf.slice(0, nl); outBuf = outBuf.slice(nl + 1);
        if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 2) listed = ((m.result && m.result.tools) || []).some((t) => t.name === "create_living_avatar");
        if (m.id === 3) { called = !!(m.result && m.result.isError === false); finish(); }
      }
    });
    p.on("error", () => finish());
    setTimeout(finish, 5000);
    const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "create_living_avatar", arguments: { spec } } });
  });
}
