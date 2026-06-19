import React from "react";

// entity-card widget — caps: ["brain.get_note","brain.recall"]. Renders a profile
// (e.g. a negotiation counterparty) pulled from the vault. `entity` is host-provided.
export function EntityCard({ entity, fields }: { entity?: any; fields?: string[] }) {
  const data = entity || {};
  const keys = fields && fields.length ? fields : Object.keys(data).filter((k) => k !== "id");
  return (
    <div className="widget" style={{ height: "100%" }}>
      <h3>{data.title || "Entity"}</h3>
      <div className="body">
        {keys.length === 0 && <div style={{ color: "var(--muted)" }}>No entity bound. Wire a `brain.recall`/`get_note` source.</div>}
        {keys.map((k) => (
          <div key={k} className="line">
            <span className="who">{k}:</span>
            <span>{String(data[k] ?? "—")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
