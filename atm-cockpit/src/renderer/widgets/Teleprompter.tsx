import React, { useEffect, useRef, useState } from "react";

// teleprompter widget — caps: ["brain.get_note"]. Auto-scrolls a script at a set WPM.
export function Teleprompter({ script = "", wpm = 130 }: { script?: string; wpm?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || !ref.current) return;
    // ~ wpm words/min -> pixels/sec is approximate; scroll smoothly.
    const pxPerSec = Math.max(8, wpm / 6);
    let raf = 0, last = performance.now();
    const step = (t: number) => {
      const dt = (t - last) / 1000; last = t;
      if (ref.current) ref.current.scrollTop += pxPerSec * dt;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, wpm]);

  return (
    <div className="widget" style={{ height: "100%" }}>
      <h3>Teleprompter <button className="opt" style={{ width: "auto", display: "inline", marginLeft: 8 }} onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</button></h3>
      <div className="body" ref={ref} style={{ overflow: "auto", fontSize: 22, lineHeight: 1.6 }}>
        {script ? script.split("\n").map((l, i) => <p key={i}>{l}</p>) : <span style={{ color: "var(--muted)" }}>No script bound.</span>}
      </div>
    </div>
  );
}
