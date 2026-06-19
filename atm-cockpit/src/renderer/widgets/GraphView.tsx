import React, { useEffect, useRef } from "react";
// @ts-ignore shared pure ESM
import { seedLayout } from "../../shared/graph/layout.mjs";
// @ts-ignore
import { reduceTrace } from "../../shared/graph/traceReducer.mjs";

// graph-view widget. Renders the vault graph and animates the EXACT recall
// traversal (seeds ignite gold, 1-hop neighbors ripple blue along real edges).
// 2D canvas here = the robust path + the ADR's HUD fallback; the shared-WebGL 3D
// scene with the avatar is the upgrade (see ADR D4) on capable hardware.
export function GraphView({ graph, trace }: { graph: any; trace: any }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const startRef = useRef<number>(0);
  const traceRef = useRef<any>(null);

  useEffect(() => { traceRef.current = trace ? reduceTrace(trace) : null; startRef.current = performance.now(); }, [trace]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    const nodes = graph?.nodes ?? [];
    const edges = graph?.edges ?? [];
    const pos = seedLayout(nodes) as Record<string, { x: number; y: number }>;

    function resize() {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * devicePixelRatio;
      canvas.height = r.height * devicePixelRatio;
    }
    resize();

    function project(p: { x: number; y: number }) {
      // fit the [-100,100] layout into the canvas with padding
      const pad = 24 * devicePixelRatio;
      const w = canvas.width - pad * 2, h = canvas.height - pad * 2;
      return { x: pad + ((p.x + 100) / 200) * w, y: pad + ((p.y + 100) / 200) * h };
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const red = traceRef.current;
      const elapsed = performance.now() - startRef.current;
      const lit = new Set<string>();
      const litEdges = new Set<string>();
      const highlight = new Set<string>(red?.highlight ?? []);
      if (red) for (const f of red.frames) if (f.tMs <= elapsed) {
        lit.add(f.node);
        if (f.edge) litEdges.add(`${f.edge.src}->${f.edge.dst}`);
      }

      // edges
      ctx.lineWidth = devicePixelRatio;
      for (const e of edges) {
        const a = pos[e.src], b = pos[e.dst];
        if (!a || !b) continue;
        const pa = project(a), pb = project(b);
        const hot = litEdges.has(`${e.src}->${e.dst}`) || litEdges.has(`${e.dst}->${e.src}`);
        ctx.strokeStyle = hot ? "rgba(91,140,255,0.9)" : "rgba(40,48,63,0.7)";
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      }
      // nodes
      for (const n of nodes) {
        const p = pos[n.id]; if (!p) continue;
        const pp = project(p);
        const isSeed = red?.seeds.includes(n.id);
        const on = lit.has(n.id);
        const radius = (on ? 7 : 4) * devicePixelRatio;
        ctx.beginPath(); ctx.arc(pp.x, pp.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = !on ? "#3a4456" : isSeed ? "#ffd166" : "#5b8cff";
        ctx.fill();
        if (highlight.has(n.id)) { ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2 * devicePixelRatio; ctx.beginPath(); ctx.arc(pp.x, pp.y, radius + 4 * devicePixelRatio, 0, Math.PI * 2); ctx.stroke(); }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [graph]);

  return (
    <div className="widget" style={{ height: "100%" }}>
      <h3>Mind graph <span style={{ color: "var(--muted)" }}>· gold = matched · blue = linked</span></h3>
      <div className="body" style={{ padding: 0 }}>
        <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>
    </div>
  );
}
