import React from "react";

// recall-panel widget. Renders grounded hits with their trust tier (honesty:
// every claim shows where it came from) and the anti-autophagy floor signal.
export function RecallPanel({ recall }: { recall: any }) {
  const results = recall?.results ?? [];
  return (
    <div className="widget" style={{ height: "100%" }}>
      <h3>Recall {recall?.mode ? `· ${recall.mode}` : ""}</h3>
      <div className="body">
        {recall && recall.floor_met === false && (
          <div className="floor-warn">⚠ leaned on agent-authored material — treat as tentative</div>
        )}
        {results.length === 0 && <div style={{ color: "var(--muted)" }}>No grounding yet. Ask something.</div>}
        {results.map((h: any) => (
          <div key={h.id} className="hit">
            <div className="title">{h.title || h.id}</div>
            <div className="snip">{h.snippet}</div>
            <div className="tier">tier: {h.trust_tier || "?"} · {h.author || "?"}{h.human ? " · human-grounded" : ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
