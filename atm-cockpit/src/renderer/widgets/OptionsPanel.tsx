import React from "react";

// options-panel widget. Holds NO brain capabilities (caps: []) — it only renders
// host-provided options and emits the choice. Reasoning stays in the host/agent.
export function OptionsPanel({ prompt, options, onChoose }: { prompt?: string; options?: string[]; onChoose?: (o: string) => void }) {
  return (
    <div className="widget" style={{ height: "100%" }}>
      <h3>Options</h3>
      <div className="body">
        {prompt && <div style={{ marginBottom: 8, color: "var(--muted)" }}>{prompt}</div>}
        {(options ?? []).map((o) => (
          <button key={o} className="opt" onClick={() => onChoose?.(o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}
