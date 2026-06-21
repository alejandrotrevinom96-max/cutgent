// Toggle optional mesh PARTS that already exist in a base (e.g. jacket, glasses,
// a hat). This is honest: it shows/hides geometry the base already has — it does
// NOT create new geometry (that's the AF8 wall). Hiding detaches the node (and its
// children) from the scene graph; the bytes stay in the file but nothing renders.
export function setParts(json, parts) {
  const applied = [], warnings = [];
  const nodes = json.nodes || [];
  const matches = (key) => nodes.map((n, i) => [n, i]).filter(([n]) => (n.name || "").toLowerCase().includes(key.toLowerCase())).map(([, i]) => i);

  const detach = (i) => {
    for (const s of json.scenes || []) if (s.nodes) s.nodes = s.nodes.filter((n) => n !== i);
    for (const n of nodes) if (n.children) n.children = n.children.filter((c) => c !== i);
  };

  for (const [key, on] of Object.entries(parts)) {
    const idxs = matches(key);
    if (!idxs.length) { warnings.push(`no part matched '${key}'`); continue; }
    for (const i of idxs) {
      if (on === false) { detach(i); applied.push(`${nodes[i].name || "node" + i}:off`); }
      else applied.push(`${nodes[i].name || "node" + i}:on`);
    }
  }
  return { applied, warnings };
}

// Which named parts the base exposes (anything that isn't a humanoid bone root).
export function listParts(json) {
  return (json.nodes || []).map((n) => n.name).filter(Boolean);
}
