import React from "react";

export interface Line { speaker: string; text: string; final: boolean; }

// live-transcript widget. Display-only; the transcript itself lives in an
// ephemeral RAM buffer in the coordinator (ADR D10). Highlights deal terms.
export function LiveTranscript({ lines, highlightTerms = [] }: { lines: Line[]; highlightTerms?: string[] }) {
  const rx = highlightTerms.length ? new RegExp(`(${highlightTerms.map(escape).join("|")})`, "ig") : null;
  return (
    <div className="widget" style={{ height: "100%" }}>
      <h3>● Live transcript <span style={{ color: "var(--muted)" }}>(local · ephemeral)</span></h3>
      <div className="body">
        {lines.length === 0 && <div style={{ color: "var(--muted)" }}>Listening… (mic off by default)</div>}
        {lines.map((l, i) => (
          <div key={i} className={`line ${l.final ? "" : "partial"}`}>
            <span className="who">{l.speaker}:</span>
            <span dangerouslySetInnerHTML={{ __html: rx ? l.text.replace(rx, "<mark>$1</mark>") : escapeHtml(l.text) }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function escape(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function escapeHtml(s: string) { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!)); }
