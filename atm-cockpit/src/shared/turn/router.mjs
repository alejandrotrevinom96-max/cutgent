// Tier router (ADR D7). Pure function: route(ctx) -> {tier, model}. The negotiation
// widget is hard-pinned: when escalation === "forbidden" there is NO code path to
// FULL/Opus, regardless of the requested kind — so prompt injection through
// negotiation content cannot lift the tier. This is mechanical, not a prompt.

const MODEL = {
  MECH: null,
  CHEAP: "claude-haiku-4-5",
  FULL: "claude-opus-4-8",
};

const MECH_KINDS = new Set(["backchannel", "indicator", "vad", "viseme", "idle"]);
const CHEAP_KINDS = new Set(["micro-suggestion", "chitchat", "short", "classify"]);
const FULL_KINDS = new Set(["deep", "synthesis", "write", "strategy"]);

/**
 * @param {{kind?:string, escalation?:"forbidden"|"allowed", offline?:boolean, widget?:string}} ctx
 * @returns {{tier:"MECH"|"CHEAP"|"FULL", model:(string|null)}}
 */
export function route(ctx = {}) {
  if (ctx.offline) return tier("MECH");
  if (MECH_KINDS.has(ctx.kind)) return tier("MECH");

  // Hard pin: forbidden escalation can never reach FULL.
  if (ctx.escalation === "forbidden") return tier("CHEAP");

  if (FULL_KINDS.has(ctx.kind)) return tier("FULL");
  if (CHEAP_KINDS.has(ctx.kind)) return tier("CHEAP");
  return tier("CHEAP"); // default: latency-friendly
}

function tier(t) {
  return { tier: t, model: MODEL[t] };
}
