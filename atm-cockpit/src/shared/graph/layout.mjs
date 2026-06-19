// Deterministic seed layout for graph nodes — pure, testable, stable.
// The REAL force simulation runs in a Web Worker on the user's machine (d3-force-3d);
// this gives every node a stable initial position (so layouts don't reshuffle across
// reindex — the "beat Obsidian's earthquake" property) and is what we can unit-test
// headless.

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Stable initial positions on a phyllotaxis spiral keyed by node id, so the same
 * id always lands in the same place regardless of insertion order.
 * @param {{id:string}[]} nodes
 * @param {{radius?:number}} [opts]
 * @returns {Record<string,{x:number,y:number,z:number}>}
 */
export function seedLayout(nodes, opts = {}) {
  const radius = opts.radius ?? 100;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out = {};
  nodes.forEach((n) => {
    const h = hash(n.id);
    const k = (h % 4096) / 4096; // stable 0..1 per id
    const r = radius * Math.sqrt(k);
    const theta = h * golden;
    out[n.id] = {
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r,
      z: ((h >>> 12) % 200) / 200 * radius - radius / 2,
    };
  });
  return out;
}
