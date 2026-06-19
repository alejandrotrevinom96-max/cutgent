// Electron MAIN (ADR D3): holds the API key, spawns the brain, runs the agent
// turn loop, and exposes UI effectors. The renderer is a pure view. The agent's
// ONLY write path to the vault is mcp__brain__write_with_provenance, so the
// guardrail holds even with a face on top.
import { app, BrowserWindow, ipcMain } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-ignore — pure ESM js module, typed via JSDoc
import { BrainClient } from "./brainClient.mjs";
// @ts-ignore
import { route } from "../shared/turn/router.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BRAIN_REPO = process.env.ATM_BRAIN || join(HERE, "..", "..", "..", "Atm_second-brain");
const BRAIN_SERVER = join(BRAIN_REPO, "server", "atm_mcp.py");

let win: BrowserWindow | null = null;
let brain: any = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#0b0d12",
    webPreferences: {
      preload: join(HERE, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(HERE, "../renderer/index.html"));
}

function send(channel: string, payload: unknown) {
  win?.webContents.send(channel, payload);
}

// ---- the agent turn loop -------------------------------------------------
// Grounds every answer in the vault via recall (honest: no recall, no claim).
// If the Claude Agent SDK + a key are present it runs the full agentic loop with
// the brain's MCP tools; otherwise it falls back to a recall-grounded responder so
// the app is demoable offline. Either way it streams the SAME turn events.
async function runTurn(turnId: string, utterance: string) {
  send("turn", { t: "state", turnId, state: "thinking" });
  const r = route({ kind: "short" });
  send("turn", { t: "tier", turnId, tier: r.tier });

  // recall + honest graph animation (works with or without the LLM)
  send("turn", { t: "state", turnId, state: "recalling" });
  send("turn", { t: "recall.begin", turnId });
  let recall: any = { results: [], trace: null };
  try {
    recall = await brain.recall(utterance, { k: 8 });
  } catch (e) {
    send("turn", { t: "result", turnId, stop: "error", error: String(e) });
    return;
  }
  if (recall.trace) send("ui/animate_graph", { turnId, trace: recall.trace });
  send("turn", { t: "recall.result", turnId, results: recall.results, floor_met: recall.floor_met });
  send("turn", { t: "recall.end", turnId });

  // produce the spoken answer
  let answer = "";
  const sdkAnswer = await tryAgentSdk(turnId, utterance, recall);
  if (sdkAnswer != null) {
    answer = sdkAnswer;
  } else {
    const top = (recall.results || []).slice(0, 3).map((x: any) => x.title).filter(Boolean);
    answer = top.length
      ? `From your notes I found ${top.length} relevant ${top.length === 1 ? "note" : "notes"}: ${top.join(", ")}. ${recall.floor_met ? "" : "Heads up — this leaned on agent-authored material, so treat it as tentative."}`
      : "I couldn't find anything in your vault on that yet. Want me to capture it?";
  }
  send("turn", { t: "state", turnId, state: "speaking" });
  send("turn", { t: "assistant.delta", turnId, text: answer });
  send("turn", { t: "speak", turnId, text: answer });
  send("turn", { t: "result", turnId, stop: "end_turn" });
}

// Lazy, optional: the real agentic loop. Returns null if unavailable so the
// fallback responder runs. (Brain tools are reachable to the SDK via mcpServers.)
async function tryAgentSdk(_turnId: string, utterance: string, _recall: any): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const sdk: any = await import("@anthropic-ai/claude-agent-sdk");
    const opts = {
      model: "claude-opus-4-8",
      mcpServers: { brain: { command: "python3", args: [BRAIN_SERVER], env: { ATM_VAULT_ROOT: BRAIN_REPO } } },
      allowedTools: ["mcp__brain__recall", "mcp__brain__graph_export", "mcp__brain__resolve_tier", "mcp__brain__citation_verify"],
    };
    let out = "";
    for await (const msg of sdk.query({ prompt: utterance, options: opts })) {
      if (msg.type === "assistant") {
        for (const block of msg.message?.content || []) if (block.type === "text") out += block.text;
      }
    }
    return out || null;
  } catch {
    return null; // SDK not installed / network down -> fallback
  }
}

app.whenReady().then(() => {
  brain = new BrainClient({ server: BRAIN_SERVER, env: { ATM_VAULT_ROOT: BRAIN_REPO } }).start();
  brain.initialize().catch((e: unknown) => console.error("[brain] init failed:", e));

  // read-only ops the renderer panels call directly (no LLM)
  ipcMain.handle("brain:graphExport", (_e, limit = 5000) => brain.graphExport(limit));
  ipcMain.handle("brain:recall", (_e, query: string, opts = {}) => brain.recall(query, opts));
  // guarded consolidation; the brain enforces anti-autophagy + provenance regardless
  ipcMain.handle("brain:consolidate", (_e, topic: string, opts = {}) => brain.consolidate(topic, opts));
  // a spoken/typed turn drives the agent loop
  ipcMain.on("turn:start", (_e, { turnId, utterance }) => { runTurn(turnId, utterance); });

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { brain?.stop(); if (process.platform !== "darwin") app.quit(); });
