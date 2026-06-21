// AF8 seam: base-PRODUCING adapters. Everything else in mcproid customizes an
// existing living base; adapters are how you'd eventually PRODUCE one (new geometry
// / rig) by delegating to a 3D engine or a generative-3D service. They live behind
// one interface so the core never changes when the wall is crossed.
//
// Adapter = {
//   id, describe() -> { requires[], produces, crossesAF8 },
//   available() -> boolean,                 // can it run in this environment?
//   produceBase(spec) -> { buffer|null, living:boolean, notes }   // HONEST: returns
//        living:false (and usually buffer:null) until a real face-rig step exists.
// }
import { blenderAdapter } from "./blender.mjs";
import { higgsfieldAdapter } from "./higgsfield.mjs";

const ADAPTERS = [blenderAdapter, higgsfieldAdapter];

export function listAdapters() { return ADAPTERS.map((a) => ({ id: a.id, ...a.describe(), available: a.available() })); }
export function getAdapter(id) { return ADAPTERS.find((a) => a.id === id) || null; }
