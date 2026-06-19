#!/usr/bin/env node
// Integration check (ADR D2/D3): spawn the REAL Python brain as a stdio child and
// drive it over MCP from Node — initialize, list tools, graph_export, recall+trace.
// Proves the app<->brain spine works end-to-end with the actual zero-dep server.
//
//   node tools/integration.mjs [path-to-brain-repo]
//
// Skips gracefully (exit 0) if python3 or the brain repo isn't present, so it never
// blocks the headless gate where the brain may live elsewhere.

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { BrainClient } from "../src/main/brainClient.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const brainRepo = process.argv[2] || join(HERE, "..", "..", "Atm_second-brain");
const server = join(brainRepo, "server", "atm_mcp.py");

function havePython() {
  try { execSync("python3 --version", { stdio: "ignore" }); return true; } catch { return false; }
}

if (!havePython() || !existsSync(server)) {
  console.log(`[SKIP] integration — ${!havePython() ? "no python3" : "brain not found at " + server}`);
  process.exit(0);
}

let ok = true;
const check = (n, c, d = "") => { console.log(`[${c ? "PASS" : "FAIL"}] ${n}${d ? " — " + d : ""}`); if (!c) ok = false; };

const brain = new BrainClient({ server, env: { ATM_VAULT_ROOT: brainRepo } }).start();
try {
  const init = await brain.initialize();
  check("initialize handshake", init?.serverInfo?.name === "atm-second-brain", JSON.stringify(init?.serverInfo));

  const tools = await brain.listTools();
  const names = new Set(tools.map((t) => t.name));
  check("tools include graph_export + recall", names.has("graph_export") && names.has("recall"), [...names].join(","));

  const gx = await brain.graphExport();
  check("graph_export returns graph.export/1", gx.schema === "graph.export/1");
  check("graph_export has nodes", Array.isArray(gx.nodes) && gx.nodes.length >= 1, `${gx.nodes?.length} nodes`);

  const r = await brain.recall("model proposes server disposes");
  check("recall returns results", Array.isArray(r.results) && r.results.length >= 1);
  check("recall trace is recall.trace/1", r.trace?.schema === "recall.trace/1");
  check("recall trace has seeds", (r.trace?.seeds || []).length >= 1, JSON.stringify(r.trace?.seeds));
  check("recall exposes hybrid retrieval signals", Array.isArray(r.retrieval?.signals) && r.retrieval.signals.includes("lexical"),
        JSON.stringify(r.retrieval));

  // consolidate is a canonical op now; dry-run must either draft (citing sources)
  // or refuse via the anti-autophagy guard — never silently write.
  check("tools include consolidate", names.has("consolidate"));
  const c = await brain.consolidate("model proposes server disposes guardrail", { k: 6 });
  check("consolidate dry-run is guarded (drafts with sources OR refuses)",
        (c.ok === true && c.dry_run === true && c.n_sources >= 1) ||
        (c.ok === false && /autophagy|grounding|no source/i.test(c.reason || "")),
        JSON.stringify(c).slice(0, 160));
} catch (e) {
  check("no exception", false, String(e));
} finally {
  brain.stop();
}

console.log("");
console.log("COCKPIT INTEGRATION:", ok ? "ALL GREEN ✅" : "FAILURES ❌");
process.exit(ok ? 0 : 1);
