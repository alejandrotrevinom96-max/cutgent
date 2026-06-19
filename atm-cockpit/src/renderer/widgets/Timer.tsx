import React, { useEffect, useRef, useState } from "react";
// @ts-ignore shared pure ESM
import { tick } from "../../shared/widgets/timer.mjs";

// timer widget — caps: ["clock"]. count-up or count-down.
export function Timer({ durationSec = 300, mode = "count" }: { durationSec?: number; mode?: "count" | "down" }) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => { if (ref.current) clearInterval(ref.current); };
    }
  }, [running]);

  const { display, expired } = tick({ mode, elapsedSec: elapsed, durationSec });
  useEffect(() => { if (expired) setRunning(false); }, [expired]);

  return (
    <div className="widget" style={{ height: "100%" }}>
      <h3>Timer</h3>
      <div className="body" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 34, fontVariantNumeric: "tabular-nums", color: expired ? "var(--warn)" : "var(--text)" }}>{display}</div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, justifyContent: "center" }}>
          <button className="opt" style={{ width: "auto" }} onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Start"}</button>
          <button className="opt" style={{ width: "auto" }} onClick={() => { setRunning(false); setElapsed(0); }}>Reset</button>
        </div>
      </div>
    </div>
  );
}
