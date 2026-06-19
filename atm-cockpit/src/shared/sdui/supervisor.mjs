// workspace-supervisor — the UI analog of the brain's pack-supervisor.
// "The agent proposes a manifest, the renderer disposes." Validates a manifest
// structurally (schema) + semantically (registry, capability scoping, layout
// integrity), all fail-closed. Pure; zero dependencies.

import { validate } from "./validate.mjs";
import { REGISTRY } from "./registry.mjs";

/**
 * @param {object} manifest         the proposed workspace.manifest/1
 * @param {object} schema           the JSON schema for workspace.manifest/1
 * @param {string[]} grantedCaps    capabilities the session policy permits
 * @returns {{ok:boolean, errors:string[], widgets:object[], droppedCaps:object[]}}
 */
export function composeWorkspace(manifest, schema, grantedCaps = ["brain.recall", "brain.graph_export", "brain.get_note", "brain.consolidate", "audio.stt", "audio.tts", "clock", "compute"]) {
  const errors = [];

  // 1. structural validation against the manifest schema (fail-closed)
  errors.push(...validate(manifest, schema));
  if (errors.length) return { ok: false, errors, widgets: [], droppedCaps: [] };

  const granted = new Set(grantedCaps);
  const widgetById = new Map();
  const droppedCaps = [];

  // 2. per-widget: known type, per-type prop sub-schema, capability scoping
  for (const w of manifest.widgets) {
    const spec = REGISTRY[w.type];
    if (!spec) { errors.push(`widget '${w.id}': unknown type '${w.type}'`); continue; }
    widgetById.set(w.id, w);

    errors.push(...validate(w.props || {}, spec.props, `widget(${w.id}).props`));

    const requested = w.caps || [];
    for (const c of requested) {
      if (!spec.maxCaps.includes(c)) {
        errors.push(`widget '${w.id}': capability '${c}' exceeds what '${w.type}' may hold`);
      }
    }
    // effective caps = requested ∩ widget.maxCaps ∩ granted; the rest are dropped
    const effective = requested.filter((c) => spec.maxCaps.includes(c) && granted.has(c));
    const dropped = requested.filter((c) => !effective.includes(c));
    if (dropped.length) droppedCaps.push({ widget: w.id, dropped });
    w.effectiveCaps = effective;
  }

  // 3. layout integrity: every placed widget exists; every widget is placed once;
  //    areas stay inside the grid
  const cols = manifest.layout.cols || 12;
  const placed = new Set();
  for (const a of manifest.layout.areas) {
    if (!widgetById.has(a.widget)) errors.push(`layout: area references unknown widget '${a.widget}'`);
    else placed.add(a.widget);
    if (a.x + a.w > cols) errors.push(`layout: area '${a.widget}' overflows grid (x+w=${a.x + a.w} > cols=${cols})`);
  }
  for (const w of manifest.widgets) {
    if (!placed.has(w.id)) errors.push(`layout: widget '${w.id}' is never placed in an area`);
  }

  // 4. wiring integrity (if present): endpoints exist; events/actions are legal
  for (const edge of manifest.wiring || []) {
    const from = widgetById.get(edge.from);
    const to = widgetById.get(edge.to);
    if (!from) errors.push(`wiring: unknown 'from' widget '${edge.from}'`);
    if (!to) errors.push(`wiring: unknown 'to' widget '${edge.to}'`);
    if (from && !REGISTRY[from.type].emits.includes(edge.on)) {
      errors.push(`wiring: '${edge.from}' (${from.type}) does not emit '${edge.on}'`);
    }
    if (to && !REGISTRY[to.type].accepts.includes(edge.action)) {
      errors.push(`wiring: '${edge.to}' (${to.type}) does not accept '${edge.action}'`);
    }
  }

  return { ok: errors.length === 0, errors, widgets: manifest.widgets, droppedCaps };
}
