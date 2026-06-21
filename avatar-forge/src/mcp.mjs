#!/usr/bin/env node
// MCP-first interface: exposes avatar-forge as agent-callable tools over the
// Model Context Protocol (stdio, newline-delimited JSON-RPC 2.0). This is the
// thin layer that makes "an AI forges/validates a living avatar" one tool call.
// The heavy lifting is the gated core (forge.mjs / validate.mjs / vrm.mjs).
import { readFileSync, writeFileSync } from "node:fs";
import { createLivingAvatar } from "./forge.mjs";
import { buildFixtureVrm } from "./fixture.mjs";
import { validateLivingVrm } from "./validate.mjs";
import { getMeta, getBones, getExpressions, getSpringCount, load } from "./vrm.mjs";

const TOOLS = [
  {
    name: "create_living_avatar",
    description: "Forge a 'living' VRM avatar (rigged: expressions + visemes + spring bones) from a base VRM + a design spec. Recolors (PBR+MToon), proportions, spring physics, identity/license. Output drops straight into atm-cockpit.",
    inputSchema: {
      type: "object",
      properties: {
        spec: { type: "object", description: "{ name, author, palette:{hair,iris,outfit}, proportions:{height}, springProfile:'soft|natural|bouncy', license, requireCommercial }" },
        basePath: { type: "string", description: "Path to a base .vrm (0.x or 1.0); omit to use the built-in fixture base." },
        outPath: { type: "string", description: "Where to write the forged .vrm (optional)." },
      },
      required: ["spec"],
    },
  },
  {
    name: "validate_vrm",
    description: "Check whether a VRM is 'living' (skeleton + expressions + visemes + blink that drive something + spring physics). strict also requires a commercial license. Pass basePath or omit for the fixture.",
    inputSchema: { type: "object", properties: { basePath: { type: "string" }, strict: { type: "boolean" } } },
  },
  {
    name: "inspect_vrm",
    description: "Summarize a VRM: spec version, metadata/license, bone count, expression coverage + drivability, spring count. Pass basePath or omit for the fixture.",
    inputSchema: { type: "object", properties: { basePath: { type: "string" } } },
  },
];

const reply = (id, result, error) => (error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result });
const text = (id, s, isError = false) => reply(id, { content: [{ type: "text", text: s }], isError });
const loadBase = (a) => (a.basePath ? readFileSync(a.basePath) : buildFixtureVrm());

function handle(msg) {
  const { id, method, params = {} } = msg;
  if (method === "initialize") return reply(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "avatar-forge", version: "0.2.0" } });
  if (method === "tools/list") return reply(id, { tools: TOOLS });
  if (method === "tools/call") {
    const a = params.arguments || {};
    try {
      if (params.name === "create_living_avatar") {
        const { buffer, manifest } = createLivingAvatar(loadBase(a), a.spec || {});
        const { ok } = validateLivingVrm(buffer);
        let written = null;
        if (a.outPath) { writeFileSync(a.outPath, buffer); written = a.outPath; }
        return text(id, `Forged living VRM (${buffer.length} bytes, base=${manifest.baseSpec}). valid=${ok}.\n` +
          `recolor=[${manifest.recolor.join(", ")}] proportions=${JSON.stringify(manifest.proportions)} spring=${manifest.springProfile} license=${manifest.license}\n` +
          (written ? `written=${written}` : `base64Len=${buffer.toString("base64").length}`) + (manifest.warnings.length ? `\nwarnings: ${manifest.warnings.join("; ")}` : ""), !ok);
      }
      if (params.name === "validate_vrm") {
        const { ok, checks } = validateLivingVrm(loadBase(a), { strict: !!a.strict });
        return text(id, `living=${ok}\n` + checks.map((c) => `${c.pass ? "OK" : "FAIL"} ${c.name}${c.detail ? " — " + c.detail : ""}`).join("\n"), !ok);
      }
      if (params.name === "inspect_vrm") {
        const buf = loadBase(a); const { json, spec } = load(buf); const meta = getMeta(json);
        const expr = getExpressions(json); const bound = [...expr.values()].filter((e) => e.bound).length;
        return text(id, JSON.stringify({ spec, name: meta.name, commercial: meta.commercial, commercialUsage: meta.commercialUsage, bones: getBones(json).size, expressions: expr.size, drivable: bound, springs: getSpringCount(json) }, null, 2));
      }
      return text(id, "unknown tool: " + params.name, true);
    } catch (e) {
      return text(id, "error: " + e.message, true);
    }
  }
  if (method && method.startsWith("notifications/")) return null;
  return reply(id, null, { code: -32601, message: "method not found: " + method });
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  buf += d; let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    const out = handle(msg);
    if (out) process.stdout.write(JSON.stringify(out) + "\n");
  }
});
