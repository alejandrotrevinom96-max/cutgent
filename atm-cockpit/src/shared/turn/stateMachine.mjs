// Turn lifecycle FSM (ADR D7/D8). Pure transition function; the EFFECTS list tells
// the host what to fire (MECH owns liveness; the model is never awaited inside a
// transition). Barge-in stops OUTPUT first, cancels cognition second.

export const STATES = ["idle", "listening", "thinking", "recalling", "speaking", "interrupted"];

// effects fired on a transition, in order
const BARGE_IN = ["tts.stop", "tts.flush", "graph.cancel", "avatar.listen", "abort", "stage.discard"];

/**
 * @param {string} state current state
 * @param {string} event one of the events below
 * @returns {{state:string, effects:string[]}}
 */
export function transition(state, event) {
  const active = state === "thinking" || state === "recalling" || state === "speaking";
  // Barge-in: any active state + user starts talking -> interrupted (MECH, <300ms)
  if (active && event === "vad.speechStart") {
    return { state: "interrupted", effects: BARGE_IN };
  }
  switch (state) {
    case "idle":
      if (event === "vad.speechStart") return { state: "listening", effects: ["avatar.listen"] };
      break;
    case "listening":
      if (event === "vad.speechStart") return { state: "listening", effects: [] }; // self-correct
      if (event === "vad.endpoint") return { state: "thinking", effects: ["backchannel"] };
      break;
    case "thinking":
      if (event === "tool.begin") return { state: "recalling", effects: ["avatar.recall", "graph.animate"] };
      if (event === "assistant.firstAudio") return { state: "speaking", effects: ["avatar.speak"] };
      break;
    case "recalling":
      if (event === "tool.end") return { state: "thinking", effects: [] };
      if (event === "assistant.firstAudio") return { state: "speaking", effects: ["avatar.speak"] };
      break;
    case "speaking":
      if (event === "turn.done") return { state: "idle", effects: ["avatar.idle"] };
      break;
    case "interrupted":
      if (event === "user.speaking") return { state: "listening", effects: ["avatar.listen"] };
      if (event === "abort.settled") return { state: "idle", effects: ["avatar.idle"] };
      break;
  }
  return { state, effects: [] }; // no-op on unhandled events (deterministic)
}
