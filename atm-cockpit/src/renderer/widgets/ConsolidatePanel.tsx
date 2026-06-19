import React, { useState } from "react";

// consolidate-panel widget — the UI face of the brain's guarded `consolidate` op.
// "The renderer proposes, the server disposes": this only collects a topic and
// shows the result. The brain refuses (anti-autophagy) and stamps provenance on
// its own; nothing here can write to the vault except through that op.
export function ConsolidatePanel({
  topic: initialTopic = "",
  dryRun = true,
  onConsolidate,
}: {
  topic?: string;
  dryRun?: boolean;
  onConsolidate?: (topic: string, opts: { dry_run: boolean }) => Promise<any>;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!topic.trim() || !onConsolidate) return;
    setBusy(true);
    try {
      setResult(await onConsolidate(topic.trim(), { dry_run: dryRun }));
    } catch (e: any) {
      setResult({ ok: false, reason: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  const refused = result && result.ok === false;
  return (
    <div className="widget" style={{ height: "100%" }}>
      <h3>Consolidate {dryRun ? "· dry-run" : ""}</h3>
      <div className="body">
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="topic to synthesize…"
            style={{ flex: 1 }}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
          <button onClick={run} disabled={busy || !topic.trim()}>{busy ? "…" : "Draft"}</button>
        </div>
        {refused && (
          <div className="floor-warn" style={{ marginTop: 8 }}>
            ⚠ refused: {result.reason}
            {result.human_fraction != null && ` (human ${result.human_fraction})`}
          </div>
        )}
        {result && result.ok && (
          <div style={{ marginTop: 8 }}>
            <div className="tier">
              {result.written ? `wrote ${result.written}` : `would write ${result.path}`}
              {" "}· {result.n_sources} sources · human {result.human_fraction}
            </div>
            <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
              {(result.source_ids || []).map((id: string) => (
                <li key={id} className="snip">{id}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
