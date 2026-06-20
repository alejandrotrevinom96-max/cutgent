#!/usr/bin/env node
// Cockpit selftest — the headless, zero-dependency gate (mirrors the brain's
// selftest discipline). Validates schemas, the negotiation-cockpit manifest, a
// battery of invalid manifests, and every pure reducer/FSM/router against fixtures.
// No GUI, no npm install required:  node tools/selftest.mjs

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { validate } from "../src/shared/sdui/validate.mjs";
import { composeWorkspace } from "../src/shared/sdui/supervisor.mjs";
import { reduceTrace } from "../src/shared/graph/traceReducer.mjs";
import { seedLayout } from "../src/shared/graph/layout.mjs";
import { reduceTranscript, contextWindow } from "../src/shared/transcript/store.mjs";
import { phonemeToViseme, VRM_VISEMES } from "../src/shared/avatar/visemeMap.mjs";
import { buildLipsync } from "../src/shared/avatar/lipsyncTimeline.mjs";
import { transition } from "../src/shared/turn/stateMachine.mjs";
import { route } from "../src/shared/turn/router.mjs";
import { ALL_WIDGET_TYPES } from "../src/shared/sdui/registry.mjs";
import { evaluate } from "../src/shared/widgets/calc.mjs";
import { toggle, progress } from "../src/shared/widgets/checklist.mjs";
import { formatClock, tick } from "../src/shared/widgets/timer.mjs";
import { computeAffect, blendAffect, domainBaseline, speechProsody, VRM_EXPRESSIONS } from "../src/shared/affect/affect.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

let ok = true;
const check = (name, cond, detail = "") => {
  console.log(`[${cond ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
};

// ---- schemas load ----
const wsSchema = J("schemas/workspace.manifest.schema.json");
const traceSchema = J("schemas/recall.trace.schema.json");
const graphSchema = J("schemas/graph.export.schema.json");
check("schemas load", !!(wsSchema && traceSchema && graphSchema));

// ---- generative UI: valid manifest passes ----
const cockpit = J("fixtures/negotiation-cockpit.workspace.json");
const composed = composeWorkspace(cockpit, wsSchema);
check("negotiation-cockpit manifest is accepted", composed.ok, composed.errors.join("; "));
check("cockpit composes 4 widgets", composed.widgets.length === 4);
check("options-panel got zero effective caps", (composed.widgets.find(w => w.id === "options").effectiveCaps || []).length === 0);

// ---- generative UI: every invalid manifest is rejected (fail-closed) ----
const invalidDir = "fixtures/invalid";
for (const f of readdirSync(join(ROOT, invalidDir)).sort()) {
  if (!f.endsWith(".json")) continue;
  const m = J(`${invalidDir}/${f}`);
  const r = composeWorkspace(m, wsSchema);
  check(`invalid manifest rejected: ${f}`, !r.ok, r.ok ? "WRONGLY ACCEPTED" : r.errors[0]);
}

// ---- capability scoping: a widget over-requesting caps is rejected ----
const overreach = JSON.parse(JSON.stringify(cockpit));
overreach.widgets.find(w => w.id === "recall").caps = ["brain.recall", "audio.tts"]; // recall-panel may not hold audio.tts
check("capability over-reach rejected", !composeWorkspace(overreach, wsSchema).ok);

// a non-consolidate widget may not hold brain.consolidate (least privilege)
const consolidateReach = JSON.parse(JSON.stringify(cockpit));
consolidateReach.widgets.find(w => w.id === "recall").caps = ["brain.recall", "brain.consolidate"];
check("brain.consolidate over-reach on recall-panel rejected", !composeWorkspace(consolidateReach, wsSchema).ok);

// ---- full widget palette (all 10 types) ----
check("registry has all 10 widget types", ALL_WIDGET_TYPES.length === 10, ALL_WIDGET_TYPES.join(","));
const palette = J("fixtures/full-palette.workspace.json");
const pc = composeWorkspace(palette, wsSchema);
check("full-palette manifest (all 10 widgets) is accepted", pc.ok, pc.errors.join("; "));
const usedTypes = new Set(palette.widgets.map((w) => w.type));
check("full-palette exercises every registered widget type",
      ALL_WIDGET_TYPES.every((t) => usedTypes.has(t)), [...usedTypes].join(","));

// ---- calculator (pure, no eval) ----
check("calc: 2+3*4 = 14", evaluate("2+3*4") === 14);
check("calc: (2+3)*4 = 20", evaluate("(2+3)*4") === 20);
check("calc: unary minus -5+2 = -3", evaluate("-5+2") === -3);
check("calc: right-assoc 2^3^2 = 512", evaluate("2^3^2") === 512);
check("calc: 10%3 = 1", evaluate("10%3") === 1);
let calcThrew = false; try { evaluate("2+"); } catch { calcThrew = true; }
check("calc: malformed expression throws (no silent NaN)", calcThrew);

// ---- checklist (pure) ----
const cl0 = [{ label: "a", done: false }, { label: "b", done: false }];
const cl1 = toggle(cl0, 0);
check("checklist: toggle flips one item immutably", cl1[0].done === true && cl0[0].done === false);
check("checklist: progress computes pct/complete", progress(cl1).pct === 50 && progress(cl1).complete === false);

// ---- timer (pure) ----
check("timer: formatClock 65 -> 1:05", formatClock(65) === "1:05");
check("timer: formatClock 3661 -> 1:01:01", formatClock(3661) === "1:01:01");
check("timer: countdown expires at 0", tick({ mode: "down", elapsedSec: 300, durationSec: 300 }).expired === true);

// ---- recall.trace/1 ----
const trace = J("fixtures/recall-trace.fixture.json");
check("trace fixture is schema-valid", validate(trace, traceSchema).length === 0, validate(trace, traceSchema).join("; "));
const red = reduceTrace(trace);
check("reduceTrace frame count == steps", red.frames.length === trace.steps.length, `${red.frames.length} vs ${trace.steps.length}`);
check("reduceTrace seeds before expands", red.frames.findIndex(f => f.kind === "expand") > red.frames.filter(f => f.kind === "seed").length - 1 || !red.frames.some(f => f.kind === "expand"));
check("reduceTrace highlight == answer_sources", JSON.stringify(red.highlight) === JSON.stringify(trace.answer_sources));
check("reduceTrace durationMs > 0", red.durationMs > 0);
check("expand frame carries its edge object", red.frames.find(f => f.kind === "expand").edge?.src === "n1");

// ---- graph.export/1 ----
const gx = J("fixtures/graph-export.fixture.json");
check("graph-export fixture is schema-valid", validate(gx, graphSchema).length === 0, validate(gx, graphSchema).join("; "));
const ids = new Set(gx.nodes.map(n => n.id));
check("graph-export edges connect exported nodes", gx.edges.every(e => ids.has(e.src) && ids.has(e.dst)));

// ---- layout determinism ----
const l1 = seedLayout(gx.nodes);
const l2 = seedLayout([...gx.nodes].reverse());
check("seedLayout is deterministic & order-independent", JSON.stringify(l1.n1) === JSON.stringify(l2.n1));

// ---- transcript ----
const events = J("fixtures/transcript-events.fixture.json");
const t = reduceTranscript(events);
check("transcript final count == 2", t.finalCount === 2, String(t.finalCount));
check("transcript context window non-empty", contextWindow(events).length > 0);

// ---- viseme map + lipsync ----
check("visemeMap: AA->aa, M->closed(null), IY->ee", phonemeToViseme("AA1") === "aa" && phonemeToViseme("M") === null && phonemeToViseme("IY0") === "ee");
const lip = J("fixtures/lipsync.fixture.json");
const ve = buildLipsync(lip);
check("lipsync skips silence (4 events from 5 phonemes)", ve.length === 4, String(ve.length));
check("lipsync ids are all valid VRM visemes", ve.every(e => VRM_VISEMES.includes(e.target.id)));
check("lipsync look-ahead clamps first event to 0ms", ve[0].startMs === 0);
check("lipsync carries turnId for epoch-guarded barge-in", ve.every(e => e.turnId === "t1"));

// ---- turn FSM ----
let s = "idle";
const path = ["vad.speechStart", "vad.endpoint", "tool.begin", "assistant.firstAudio", "turn.done"];
const expect = ["listening", "thinking", "recalling", "speaking", "idle"];
let fsmOk = true;
path.forEach((ev, i) => { s = transition(s, ev).state; if (s !== expect[i]) fsmOk = false; });
check("FSM happy path idle->...->idle", fsmOk, `ended at ${s}`);
const bi = transition("speaking", "vad.speechStart");
check("FSM barge-in: speaking+speech -> interrupted", bi.state === "interrupted");
check("FSM barge-in stops output before cancelling cognition", bi.effects[0] === "tts.stop" && bi.effects.includes("abort") && bi.effects.includes("stage.discard"));

// ---- tier router ----
check("router: deep -> FULL/opus", route({ kind: "deep" }).model === "claude-opus-4-8");
check("router: micro-suggestion -> CHEAP/haiku", route({ kind: "micro-suggestion" }).model === "claude-haiku-4-5");
check("router: backchannel -> MECH/no-model", route({ kind: "backchannel" }).tier === "MECH" && route({ kind: "backchannel" }).model === null);
check("router: NEGOTIATION PIN — deep + forbidden never escalates to FULL", route({ kind: "deep", escalation: "forbidden" }).tier === "CHEAP");
check("router: offline forces MECH", route({ kind: "deep", offline: true }).tier === "MECH");

// ---- affect engine: demeanor adapts to topic (baseline) + moment (override) ----
const phil = computeAffect({ domain: "philosophy" });
check("affect: philosophy baseline is serious + low arousal",
      phil.baseline === "serious" && phil.arousal < 0.5, `${phil.mood}/${phil.arousal}`);
check("affect: business/negotiation baseline is focused",
      domainBaseline("business-finance") === "focused" && domainBaseline("negotiation") === "focused");
const warm = computeAffect({ domain: "counsel" });
check("affect: counsel baseline is warm (positive valence)", warm.valence > 0, String(warm.valence));
// moment override: she can laugh even on a serious topic
const joke = computeAffect({ domain: "philosophy", text: "jajaja that's hilarious 😂" });
check("affect: humor flips a serious baseline to playful", joke.mood === "playful" && joke.expressions.happy > 0.4,
      `${joke.mood}/${joke.expressions.happy}`);
// distress softens to concern regardless of topic
const distress = computeAffect({ domain: "sales", text: "honestly I'm so overwhelmed and anxious" });
check("affect: distress overrides to concerned (care first)",
      distress.mood === "concerned" && distress.expressions.sad > 0 && distress.valence < 0,
      `${distress.mood}/${distress.valence}`);
// every weight is a valid VRM expression in [0,1]
const okExpr = Object.entries(joke.expressions).every(([k, v]) => VRM_EXPRESSIONS.includes(k) && v >= 0 && v <= 1);
check("affect: expression weights are valid VRM expressions in [0,1]", okExpr, JSON.stringify(joke.expressions));
// blendAffect eases (fluid, no snap): blended happy lands strictly between prev and target
const prev = computeAffect({ domain: "philosophy" });               // low happy
const target = computeAffect({ domain: "philosophy", text: "haha" }); // high happy
const eased = blendAffect(prev, target, 0.25);
check("affect: blendAffect eases between states (fluid transition)",
      eased.expressions.happy > prev.expressions.happy && eased.expressions.happy < target.expressions.happy,
      `${prev.expressions.happy} -> ${eased.expressions.happy} -> ${target.expressions.happy}`);
check("affect: computeAffect is deterministic",
      JSON.stringify(computeAffect({ domain: "philosophy", text: "haha" })) === JSON.stringify(target));
// voice tracks affect: playful speaks faster/brighter than a serious baseline, all in safe range
const proSerious = speechProsody(computeAffect({ domain: "philosophy" }));
const proPlayful = speechProsody(computeAffect({ domain: "philosophy", text: "haha" }));
check("affect: voice prosody is faster + brighter when playful than serious",
      proPlayful.rate > proSerious.rate && proPlayful.pitch > proSerious.pitch,
      `serious ${proSerious.rate}/${proSerious.pitch} vs playful ${proPlayful.rate}/${proPlayful.pitch}`);
check("affect: prosody stays in SpeechSynthesis-safe range",
      proPlayful.rate >= 0.5 && proPlayful.rate <= 2 && proPlayful.pitch >= 0.5 && proPlayful.pitch <= 1.6);

console.log("");
console.log("COCKPIT SELFTEST:", ok ? "ALL GREEN ✅" : "FAILURES ❌");
process.exit(ok ? 0 : 1);
