// Transcript reducer — STT events -> displayable lines + a rolling context window.
// Pure; zero dependencies. Live transcription is LOCAL-ONLY + EPHEMERAL by policy:
// this reducer holds no persistence and the caller is expected to keep it in a RAM
// ring buffer that is crypto-shredded on widget close (see ADR D10).

/**
 * @param {{kind:"partial"|"final", speaker:string, text:string, turnId?:string}[]} events
 * @returns {{lines:{speaker:string,text:string,final:boolean}[], finalCount:number}}
 */
export function reduceTranscript(events) {
  const finalLines = [];
  const partials = {};
  for (const e of events) {
    if (e.kind === "partial") {
      partials[e.speaker] = e.text;
    } else if (e.kind === "final") {
      finalLines.push({ speaker: e.speaker, text: e.text, final: true });
      delete partials[e.speaker];
    }
  }
  const partialLines = Object.entries(partials).map(([speaker, text]) => ({ speaker, text, final: false }));
  return { lines: [...finalLines, ...partialLines], finalCount: finalLines.length };
}

/**
 * The salient recent text fed to recall/options widgets via wiring.
 * @param {object[]} events
 * @param {number} [chars]
 */
export function contextWindow(events, chars = 400) {
  const { lines } = reduceTranscript(events);
  const txt = lines.map((l) => `${l.speaker}: ${l.text}`).join("\n");
  return txt.length > chars ? txt.slice(txt.length - chars) : txt;
}
