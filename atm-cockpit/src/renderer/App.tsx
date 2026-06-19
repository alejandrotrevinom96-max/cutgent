import React, { useEffect, useMemo, useRef, useState } from "react";
import { cockpit, newTurnId } from "./lib/ipc";
import { VrmStage } from "./avatar/VrmStage";
import { WorkspaceHost } from "./WorkspaceHost";
import { BrowserTts, type VisemeEvent } from "./providers/tts";
import { BrowserStt, type SttEvent } from "./providers/stt";
// @ts-ignore shared pure ESM
import { reduceTranscript } from "../shared/transcript/store.mjs";
import manifest from "../../fixtures/negotiation-cockpit.workspace.json";

const tts = new BrowserTts();
const stt = new BrowserStt();

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
  const stateRef = useRef(avatarState);
  stateRef.current = avatarState;

  // load the static graph + subscribe to turn/effect events
  useEffect(() => {
    cockpit.graphExport().then(setGraph).catch(() => {});
    const offTurn = cockpit.onTurn((e) => {
      if (e.t === "state") setAvatarState(e.state);
      else if (e.t === "recall.result") setRecall({ ...e, results: e.results });
      else if (e.t === "speak") tts.speak(e.text, e.turnId, setVisemes).then(() => setAvatarState("idle"));
    });
    const offGraph = cockpit.onAnimateGraph((e) => setTrace(e.trace));
    return () => { offTurn(); offGraph(); };
  }, []);

  function startTurn(utterance: string) {
    if (!utterance.trim()) return;
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
    onOption: (o: string) => startTurn(`I'm leaning toward: ${o}. What's the risk?`),
  }), [transcriptLines, recall, trace, graph]);

  return (
    <div className="app">
      <div className="stage">
        <div className={`badge ${micOn ? "live" : ""}`}>{micOn ? "● listening (local)" : avatarState}</div>
        <VrmStage visemes={visemes} state={avatarState} />
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
