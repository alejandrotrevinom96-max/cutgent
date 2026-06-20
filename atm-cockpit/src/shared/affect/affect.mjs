// Affect engine — the avatar's demeanor adapts to the conversation, not a fixed
// pose. Pure, zero-dependency, headless-testable (same discipline as the brain).
//
// Two layers, by design:
//   1. BASELINE by topic/domain — serious for philosophy, focused/strict for
//      business & negotiation, warm for counsel/relationships, encouraging for
//      learning. (Ties to the brain's expertise packs: the active pack sets the room.)
//   2. MOMENT override by what was just said — she can laugh at something funny even
//      mid-serious, soften to concern if you're overwhelmed, warm up to praise.
//
// Output is engine-agnostic: VRM 1.0 expression weights (happy/angry/sad/relaxed/
// surprised/neutral) + valence/arousal + a voice-prosody hint + a body-energy hint.
// blendAffect() eases between states each frame so transitions are FLUID, never snapped.

export const VRM_EXPRESSIONS = ["happy", "angry", "sad", "relaxed", "surprised", "neutral"];

// mood -> baseline expression mix + affect coords + voice prosody + body energy
export const MOODS = {
  serious:     { expressions: { neutral: 0.7, relaxed: 0.2 },  valence: 0.0,  arousal: 0.30, energy: 0.30, voice: { rate: 0.96, pitch: 0.98, energy: 0.50 } },
  focused:     { expressions: { neutral: 0.85 },               valence: 0.05, arousal: 0.45, energy: 0.40, voice: { rate: 1.00, pitch: 1.00, energy: 0.60 } },
  warm:        { expressions: { relaxed: 0.5, happy: 0.3 },     valence: 0.50, arousal: 0.40, energy: 0.45, voice: { rate: 0.98, pitch: 1.02, energy: 0.60 } },
  playful:     { expressions: { happy: 0.8, surprised: 0.1 },   valence: 0.70, arousal: 0.70, energy: 0.80, voice: { rate: 1.05, pitch: 1.06, energy: 0.80 } },
  calm:        { expressions: { relaxed: 0.7, neutral: 0.2 },   valence: 0.30, arousal: 0.20, energy: 0.25, voice: { rate: 0.95, pitch: 0.99, energy: 0.45 } },
  concerned:   { expressions: { sad: 0.4, relaxed: 0.3 },       valence: -0.20, arousal: 0.35, energy: 0.35, voice: { rate: 0.95, pitch: 0.99, energy: 0.50 } },
  encouraging: { expressions: { happy: 0.45, relaxed: 0.25 },   valence: 0.55, arousal: 0.55, energy: 0.60, voice: { rate: 1.02, pitch: 1.03, energy: 0.70 } },
  neutral:     { expressions: { neutral: 1.0 },                 valence: 0.0,  arousal: 0.30, energy: 0.35, voice: { rate: 1.00, pitch: 1.00, energy: 0.55 } },
};

// domain / expertise-pack family -> baseline mood ("the room she reads")
const DOMAIN_MOOD = {
  philosophy: "serious", decisionmaking: "serious",
  businessfinance: "focused", businessstrategy: "focused", negotiation: "focused",
  sales: "focused", legalliteracy: "focused", marketinggrowth: "focused",
  personalfinance: "focused", leadershipmanagement: "focused", communication: "focused",
  dataanalysis: "focused", softwareengineering: "focused", productdesignux: "focused",
  counsel: "warm", relationships: "warm", psychology: "warm",
  learning: "encouraging", productivity: "encouraging",
  writing: "calm", photography: "calm", cinematography: "encouraging",
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const round = (x) => Math.round(x * 1000) / 1000;

function normDomain(d) { return (d || "").toLowerCase().replace(/[^a-z]/g, ""); }

export function domainBaseline(domain) {
  return DOMAIN_MOOD[normDomain(domain)] || "neutral";
}

// crude bilingual (EN/ES) cue detection on the latest utterance
const CUES = {
  humor: /(haha|hahaha|lol|lmao|rofl|jaja|jeje|funny|hilarious|gracios|chistos|broma|😂|🤣|😆|😅)/i,
  distress: /(stressed|overwhelmed|anxious|burned out|depress|hopeless|scared|afraid|abrumad|estresad|ansios|triste|deprimid|miedo|angusti|no puedo m[aá]s)/i,
  excited: /(amazing|awesome|incredible|let'?s go|pumped|so excited|incre[ií]ble|genial|emocionad|vamos|por fin|finally|🔥|🎉)/i,
  praise: /(thank you|thanks|great job|well done|nailed it|gracias|excelente|buen trabajo|me encanta)/i,
};

export function readCues(text) {
  const t = text || "";
  return {
    humor: CUES.humor.test(t),
    distress: CUES.distress.test(t),
    excited: CUES.excited.test(t),
    praise: CUES.praise.test(t),
    exclaim: (t.match(/!/g) || []).length >= 1,
  };
}

function blendExpr(a, b, t) {
  const out = {};
  for (const k of VRM_EXPRESSIONS) out[k] = round(clamp01(lerp(a[k] || 0, b[k] || 0, t)));
  return out;
}

function dominantOf(expr) {
  return Object.entries(expr).sort((x, y) => y[1] - x[1])[0][0];
}

/**
 * Compute the target affect from the active domain (baseline) and the latest text
 * (moment override). Pure & deterministic.
 * @param {{domain?:string, text?:string, baseline?:string}} ctx
 */
export function computeAffect({ domain, text = "", baseline } = {}) {
  const baseMood = baseline || domainBaseline(domain);
  const cues = readCues(text);

  let mood = baseMood;
  let blend = 0;
  if (cues.distress) { mood = "concerned"; blend = 0.85; }        // care trumps the topic
  else if (cues.humor) { mood = "playful"; blend = 0.8; }          // can laugh mid-serious
  else if (cues.excited || cues.praise) {                         // warm up / cheer on
    mood = baseMood === "serious" || baseMood === "focused" ? "warm" : "encouraging";
    blend = 0.6;
  }

  const a = MOODS[baseMood] || MOODS.neutral;
  const b = MOODS[mood] || MOODS.neutral;
  const expressions = blendExpr(a.expressions, b.expressions, blend);
  const valence = round(lerp(a.valence, b.valence, blend));
  const arousal = round(clamp01(lerp(a.arousal, b.arousal, blend) + (cues.exclaim ? 0.05 : 0)));
  const energy = round(clamp01(lerp(a.energy, b.energy, blend)));
  const voice = {
    rate: round(lerp(a.voice.rate, b.voice.rate, blend)),
    pitch: round(lerp(a.voice.pitch, b.voice.pitch, blend)),
    energy: round(clamp01(lerp(a.voice.energy, b.voice.energy, blend))),
  };
  return {
    mood: blend > 0.5 ? mood : baseMood,
    baseline: baseMood,
    valence, arousal, energy, voice,
    expressions,
    dominant: dominantOf(expressions),
    cues,
  };
}

/**
 * Ease the current affect toward a target (call per frame / per turn). Keeps
 * demeanor changes fluid instead of snapping. alpha in (0,1]; smaller = smoother.
 */
export function blendAffect(prev, target, alpha = 0.25) {
  if (!prev) return target;
  const expressions = {};
  for (const k of VRM_EXPRESSIONS) {
    expressions[k] = round(clamp01(lerp(prev.expressions[k] || 0, target.expressions[k] || 0, alpha)));
  }
  return {
    ...target,
    expressions,
    dominant: dominantOf(expressions),
    valence: round(lerp(prev.valence, target.valence, alpha)),
    arousal: round(lerp(prev.arousal, target.arousal, alpha)),
    energy: round(lerp(prev.energy, target.energy, alpha)),
  };
}

/**
 * Map an affect state to browser SpeechSynthesis-safe prosody so the VOICE shifts
 * with mood too (serious = steadier/slower, playful = brighter/faster, concerned =
 * softer). Clamped to safe ranges (rate 0.5-2, pitch 0.5-1.6). Pure.
 */
export function speechProsody(affect) {
  const v = (affect && affect.voice) || MOODS.neutral.voice;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  return {
    rate: round(clamp(v.rate ?? 1, 0.5, 2)),
    pitch: round(clamp(v.pitch ?? 1, 0.5, 1.6)),
    energy: round(clamp(v.energy ?? 0.55, 0, 1)),
  };
}

