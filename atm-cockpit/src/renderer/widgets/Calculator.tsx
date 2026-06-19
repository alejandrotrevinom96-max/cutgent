import React, { useState } from "react";
// @ts-ignore shared pure ESM (validated headless; no eval)
import { evaluate } from "../../shared/widgets/calc.mjs";

// calculator widget — caps: ["compute"]. Pure arithmetic, never eval (ADR D9).
export function Calculator() {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string>("");
  function run() {
    try { setResult(String(evaluate(expr))); }
    catch (e) { setResult("⚠ " + (e as Error).message); }
  }
  return (
    <div className="widget" style={{ height: "100%" }}>
      <h3>Calculator</h3>
      <div className="body">
        <input
          value={expr}
          placeholder="e.g. (1200 - 200) * 0.8"
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px" }}
        />
        <div style={{ marginTop: 8, fontSize: 18 }}>{result && <strong>= {result}</strong>}</div>
      </div>
    </div>
  );
}
