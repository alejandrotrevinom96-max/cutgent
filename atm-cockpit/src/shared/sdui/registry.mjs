// The CLOSED widget registry — the disposer for generative UI.
// Each widget type declares the MAXIMUM capabilities it may ever hold and a light
// prop sub-schema. The renderer maps type -> a vetted React component; there is no
// path from a manifest to execution except through a component shipped here.

export const REGISTRY = {
  "live-transcript": {
    maxCaps: ["audio.stt"],
    props: {
      type: "object",
      additionalProperties: true,
      properties: {
        speakerLabels: { type: "boolean" },
        redactPII: { type: "boolean" },
        highlightTerms: { type: "array", items: { type: "string" } },
      },
    },
    emits: ["segment", "contextWindow"],
    accepts: ["highlight"],
  },
  "recall-panel": {
    maxCaps: ["brain.recall", "brain.get_note"],
    props: {
      type: "object",
      additionalProperties: true,
      properties: {
        querySource: { type: "string" },
        k: { type: "integer", minimum: 1, maximum: 50 },
        showCitations: { type: "boolean" },
      },
    },
    emits: ["noteOpened", "notes"],
    accepts: ["query"],
  },
  "graph-view": {
    maxCaps: ["brain.graph_export", "brain.recall"],
    props: {
      type: "object",
      additionalProperties: true,
      properties: {
        animateTrace: { type: "boolean" },
        seedQuery: { type: "string" },
        depth: { type: "integer", minimum: 1, maximum: 3 },
      },
    },
    emits: ["nodeSelected"],
    accepts: ["focus", "animate"],
  },
  "options-panel": {
    maxCaps: [],
    props: {
      type: "object",
      additionalProperties: true,
      properties: {
        prompt: { type: "string", maxLength: 200 },
        options: { type: "array", items: { type: "string" }, maxItems: 8 },
      },
    },
    emits: ["optionChosen"],
    accepts: ["context", "suggestions"],
  },
  "entity-card": {
    maxCaps: ["brain.get_note", "brain.recall"],
    props: { type: "object", additionalProperties: true, properties: {} },
    emits: ["entitySelected"],
    accepts: ["entity"],
  },
  "checklist": {
    maxCaps: ["brain.get_note"],
    props: { type: "object", additionalProperties: true, properties: {} },
    emits: ["itemToggled", "completed"],
    accepts: ["addItem"],
  },
  "timer": {
    maxCaps: ["clock"],
    props: {
      type: "object", additionalProperties: true,
      properties: { durationSec: { type: "integer", minimum: 1 }, mode: { enum: ["count", "down"] } },
    },
    emits: ["elapsed", "expired"],
    accepts: ["start", "pause", "reset"],
  },
  "teleprompter": {
    maxCaps: ["brain.get_note"],
    props: { type: "object", additionalProperties: true, properties: {} },
    emits: [],
    accepts: ["setScript", "scrollTo"],
  },
  "calculator": {
    maxCaps: ["compute"],
    props: { type: "object", additionalProperties: true, properties: {} },
    emits: ["result"],
    accepts: ["setExpression"],
  },
};

export const ALL_WIDGET_TYPES = Object.keys(REGISTRY);
