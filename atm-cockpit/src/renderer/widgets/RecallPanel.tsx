import React from "react";

// recall-panel widget. Renders grounded hits with their trust tier (honesty:
// every claim shows where it came from) and the anti-autophagy floor signal.
export function RecallPanel({ recall }: { recall: any }) {
  const results = recall?.results ?? [];
  const ret = recall?.retrieval;
  const signals = ret?.signals?.join("+");
  return (
    <div className="widget" style={{ height: "100%" }}>
      <h3>Recall {recall?.mode ? `· ${recall.mode}` : ""}{signals ? ` · ${ret.fusion}(${signals})` : ""}</h3>
      <div className="body">
        {ret?.embeddings && <div className="tier">semantic rerank: on</div>}
        {ret?.expanded_query?.length > 0 && (
          <div className="tier">expanded: {ret.expanded_query.join(", ")}</div>
        )}
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
