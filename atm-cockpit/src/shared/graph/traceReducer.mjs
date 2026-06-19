// reduceTrace — turn a recall.trace/1 into an ordered animation timeline.
// The brain emits WHICH nodes/edges (honest); the app assigns the timing here.
// Pure; zero dependencies.

/**
 * @param {object} trace recall.trace/1
 * @param {{seedStaggerMs?:number, expandStaggerMs?:number}} [opts]
 */
export function reduceTrace(trace, opts = {}) {
  const seedStaggerMs = opts.seedStaggerMs ?? 80;
  const expandStaggerMs = opts.expandStaggerMs ?? 120;
  const frames = [];
  let t = 0;
  for (const step of trace.steps || []) {
    if (step.kind === "seed") {
      frames.push({ tMs: t, kind: "seed", node: step.node });
      t += seedStaggerMs;
    } else if (step.kind === "expand") {
      const edge = step.edge != null ? (trace.edges || [])[step.edge] : null;
      frames.push({ tMs: t, kind: "expand", node: step.node, edge });
      t += expandStaggerMs;
    }
  }
  return {
    frames,
    durationMs: t,
    seeds: [...(trace.seeds || [])],
    expanded: [...(trace.expanded || [])],
    highlight: [...(trace.answer_sources || [])],
  };
}
