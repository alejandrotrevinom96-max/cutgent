#!/usr/bin/env node
// MCP-first interface: exposes avatar-forge as an agent-callable tool over the
// Model Context Protocol (stdio, newline-delimited JSON-RPC 2.0). This is the
// thin layer that makes "an AI forges a living avatar" literally one tool call.
// The heavy lifting is the gated core (forge.mjs / validate.mjs).
import { readFileSync, writeFileSync } from "node:fs";
import { createLivingAvatar } from "./forge.mjs";
import { buildFixtureVrm } from "./fixture.mjs";
import { validateLivingVrm } from "./validate.mjs";

const TOOL = {
  name: "create_living_avatar",
  description: "Forge a 'living' VRM avatar (rigged: expressions + visemes + spring bones) from a base VRM + a design spec. Output drops straight into atm-cockpit.",
  inputSchema: {
    type: "object",
    properties: {
      spec: { type: "object", description: "Design spec: { name, author, palette:{hair,iris,outfit,...}, license }" },
      basePath: { type: "string", description: "Path to a base .vrm; omit to use the built-in fixture base." },
      outPath: { type: "string", description: "Where to write the forged .vrm (optional)." },
    },
    required: ["spec"],
  },
};

function reply(id, result, error) {
  const m = { jsonrpc: "2.0", id };
  if (error) m.error = error; else m.result = result;
  return m;
}

function handle(msg) {
  const { id, method, params = {} } = msg;
  if (method === "initialize")
    return reply(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "avatar-forge", version: "0.1.0" } });
  if (method === "tools/list") return reply(id, { tools: [TOOL] });
  if (method === "tools/call") {
    const a = params.arguments || {};
    try {
      const base = a.basePath ? readFileSync(a.basePath) : buildFixtureVrm();
      const { buffer, applied } = createLivingAvatar(base, a.spec || {});
      const { ok, checks } = validateLivingVrm(buffer);
      let written = null;
      if (a.outPath) { writeFileSync(a.outPath, buffer); written = a.outPath; }
      const text =
        `Forged living VRM (${buffer.length} bytes). valid=${ok}. recolor=[${applied.join(", ")}]. ` +
        `${written ? "written=" + written : "base64Len=" + buffer.toString("base64").length}\n` +
        checks.map((c) => `${c.pass ? "OK" : "FAIL"} ${c.name}`).join("\n");
      return reply(id, { content: [{ type: "text", text }], isError: !ok });
    } catch (e) {
      return reply(id, { content: [{ type: "text", text: "error: " + e.message }], isError: true });
    }
  }
  if (method && method.startsWith("notifications/")) return null;
  return reply(id, null, { code: -32601, message: "method not found: " + method });
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    const out = handle(msg);
    if (out) process.stdout.write(JSON.stringify(out) + "\n");
  }
});
