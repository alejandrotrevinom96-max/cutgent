import React, { useEffect, useMemo, useRef, useState } from "react";
import { cockpit, newTurnId } from "./lib/ipc";
import { VrmStage } from "./avatar/VrmStage";
import { WorkspaceHost } from "./WorkspaceHost";
import { pickStt, pickTts, type VisemeEvent, type SttEvent } from "./providers";
// @ts-ignore shared pure ESM
import { reduceTranscript } from "../shared/transcript/store.mjs";
// @ts-ignore shared pure ESM
import { computeAffect } from "../shared/affect/affect.mjs";
import manifest from "../../fixtures/negotiation-cockpit.workspace.json";

const tts = pickTts();
const stt = pickStt();

export function App() {
  const [graph, setGraph] = useState<any>({ nodes: [], edges: [] });
  const [recall, setRecall] = useState<any>(null);
  const [trace, setTrace] = useState<any>(null);
  const [avatarState, setAvatarState] = useState("idle");
  const [visemes, setVisemes] = useState<VisemeEvent[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [text, setText] = useState("");
  const sttEvents = useRef<SttEvent[]>([]);          // EPHEMERAL transcript buffer (ADR D10)
  const [transcriptLines, setTranscriptLines] = useState<any[]>([]);
  const [affect, setAffect] = useState<any>(() => computeAffect({}));
  const stateRef = useRef(avatarState);
  stateRef.current = avatarState;

  // load the static graph + subscribe to turn/effect events
  useEffect(() => {
    cockpit.graphExport().then(setGraph).catch(() => {});
    const offTurn = cockpit.onTurn((e) => {
      if (e.t === "state") setAvatarState(e.state);
      else if (e.t === "recall.result") {
        setRecall({ ...e, results: e.results });
        // refine demeanor with the topic the brain actually grounded in
        const domain = e.results?.[0]?.domain;
        if (domain) setAffect(computeAffect({ domain, text: lastQueryRef.current }));
      }
      else if (e.t === "speak") tts.speak(e.text, e.turnId, setVisemes).then(() => setAvatarState("idle"));
    });
    const offGraph = cockpit.onAnimateGraph((e) => setTrace(e.trace));
    return () => { offTurn(); offGraph(); };
  }, []);

  const lastQueryRef = useRef("");
  function startTurn(utterance: string) {
    if (!utterance.trim()) return;
    lastQueryRef.current = utterance.trim();
    // demeanor reacts to what was just said; refined with the topic when recall lands
    const domain = recall?.results?.[0]?.domain;
    setAffect(computeAffect({ domain, text: utterance.trim() }));
    setText("");
    cockpit.startTurn(newTurnId(), utterance.trim());
  }

  function toggleMic() {
    if (micOn) { stt.stop(); setMicOn(false); return; }
    if (!stt.available()) { alert("SpeechRecognition not available in this build — use the text box."); return; }
    sttEvents.current = [];
    stt.start((ev) => {
      // Barge-in: user speaks while avatar is speaking -> stop output first (ADR D8)
      if (stateRef.current === "speaking") { tts.stop(); setAvatarState("interrupted"); }
      sttEvents.current.push(ev);
      setTranscriptLines(reduceTranscript(sttEvents.current).lines);
      if (ev.kind === "final") startTurn(ev.text);
    });
    setMicOn(true);
  }

  const ctx = useMemo(() => ({
    transcriptLines, recall, trace, graph,
    lastQuery: lastQueryRef.current,
    onOption: (o: string) => startTurn(`I'm leaning toward: ${o}. What's the risk?`),
    onConsolidate: (topic: string, opts: { dry_run: boolean }) => cockpit.consolidate(topic, opts),
  }), [transcriptLines, recall, trace, graph]);

  return (
    <div className="app">
      <div className="stage">
        <div className={`badge ${micOn ? "live" : ""}`}>{micOn ? "● listening (local)" : avatarState}</div>
        <VrmStage visemes={visemes} state={avatarState} affect={affect} />
      </div>
      <div className="workspace">
        <WorkspaceHost manifest={manifest as any} ctx={ctx} />
      </div>
      <div className="bar">
        <button className={`mic ${micOn ? "on" : ""}`} onClick={toggleMic}>{micOn ? "● Stop mic" : "🎤 Mic"}</button>
        <input
          value={text}
          placeholder="Ask your second brain…  (e.g. 'help me negotiate this deal')"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") startTurn(text); }}
        />
        <button onClick={() => startTurn(text)}>Send</button>
      </div>
    </div>
  );
}
