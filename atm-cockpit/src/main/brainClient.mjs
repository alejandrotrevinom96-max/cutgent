// BrainClient — speaks MCP (newline-delimited JSON-RPC 2.0) to the brain spawned
// as a stdio child. This is the entire app<->brain boundary (ADR D2): it adds
// NOTHING to the brain, and every write still goes through write_with_provenance,
// so the guardrail ("the server disposes") holds. Zero npm dependencies (node
// builtins only) so it is unit-runnable headless.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export class BrainClient {
  constructor({ python = "python3", server, env = {} } = {}) {
    if (!server) throw new Error("BrainClient requires { server }");
    this.python = python;
    this.server = server;
    this.env = env;
    this._id = 0;
    this._pending = new Map();
    this.proc = null;
  }

  start() {
    this.proc = spawn(this.python, [this.server], {
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this._rl = createInterface({ input: this.proc.stdout });
    this._rl.on("line", (line) => {
      const s = line.trim();
      if (!s) return;
      let msg;
      try { msg = JSON.parse(s); } catch { return; }
      if (msg.id != null && this._pending.has(msg.id)) {
        const { resolve, reject } = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else resolve(msg.result);
      }
    });
    this.proc.on("exit", (code) => {
      for (const { reject } of this._pending.values()) reject(new Error(`brain exited (${code})`));
      this._pending.clear();
    });
    return this;
  }

  _send(method, params) {
    const id = ++this._id;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this.proc.stdin.write(payload);
    });
  }

  _notify(method, params) {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async initialize() {
    const res = await this._send("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    this._notify("notifications/initialized", {});
    return res;
  }

  async listTools() {
    const res = await this._send("tools/list", {});
    return res.tools;
  }

  /** Call a brain tool. Returns the parsed JSON of the first text content block. */
  async call(name, args = {}) {
    const res = await this._send("tools/call", { name, arguments: args });
    const text = res?.content?.[0]?.text ?? "{}";
    try { return JSON.parse(text); } catch { return { text }; }
  }

  // Convenience wrappers for the canonical ops the cockpit uses.
  recall(query, opts = {}) { return this.call("recall", { query, with_trace: true, ...opts }); }
  graphExport(limit = 5000) { return this.call("graph_export", { limit }); }
  // Guarded consolidation. dry_run defaults true; the brain enforces anti-autophagy
  // and provenance regardless — the cockpit only proposes.
  consolidate(topic, opts = {}) { return this.call("consolidate", { topic, dry_run: true, ...opts }); }

  stop() {
    try { this.proc?.stdin.end(); } catch { /* noop */ }
    try { this.proc?.kill(); } catch { /* noop */ }
  }
}
