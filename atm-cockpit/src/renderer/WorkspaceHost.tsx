import React, { useMemo } from "react";
// @ts-ignore shared pure ESM
import { composeWorkspace } from "../shared/sdui/supervisor.mjs";
import wsSchema from "../../schemas/workspace.manifest.schema.json";
import { LiveTranscript } from "./widgets/LiveTranscript";
import { RecallPanel } from "./widgets/RecallPanel";
import { OptionsPanel } from "./widgets/OptionsPanel";
import { GraphView } from "./widgets/GraphView";
import { EntityCard } from "./widgets/EntityCard";
import { Checklist } from "./widgets/Checklist";
import { Timer } from "./widgets/Timer";
import { Teleprompter } from "./widgets/Teleprompter";
import { Calculator } from "./widgets/Calculator";

// WorkspaceHost — the renderer half of "the agent proposes, the renderer disposes".
// It runs the SAME composeWorkspace validator used in the headless selftest; an
// invalid/over-reaching manifest renders an error, never arbitrary UI.
export function WorkspaceHost({ manifest, ctx }: { manifest: any; ctx: any }) {
  const composed = useMemo(() => composeWorkspace(manifest, wsSchema), [manifest]);

  if (!composed.ok) {
    return (
      <div className="widget"><h3>Workspace rejected</h3>
        <div className="body"><ul>{composed.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul></div>
      </div>
    );
  }

  const cols = manifest.layout.cols || 12;
  const byId: Record<string, any> = Object.fromEntries(manifest.widgets.map((w: any) => [w.id, w]));

  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: "minmax(110px, auto)" }}>
      {manifest.layout.areas.map((a: any) => {
        const w = byId[a.widget];
        return (
          <div key={a.widget} style={{ gridColumn: `${a.x + 1} / span ${a.w}`, gridRow: `${a.y + 1} / span ${a.h}` }}>
            {renderWidget(w, ctx)}
          </div>
        );
      })}
    </div>
  );
}

function renderWidget(w: any, ctx: any) {
  switch (w.type) {
    case "live-transcript":
      return <LiveTranscript lines={ctx.transcriptLines} highlightTerms={w.props?.highlightTerms} />;
    case "recall-panel":
      return <RecallPanel recall={ctx.recall} />;
    case "graph-view":
      return <GraphView graph={ctx.graph} trace={ctx.trace} />;
    case "options-panel":
      return <OptionsPanel prompt={w.props?.prompt} options={w.props?.options} onChoose={ctx.onOption} />;
    case "entity-card":
      return <EntityCard entity={ctx.entity} fields={w.props?.fields} />;
    case "checklist":
      return <Checklist seed={w.props?.items} />;
    case "timer":
      return <Timer durationSec={w.props?.durationSec} mode={w.props?.mode} />;
    case "teleprompter":
      return <Teleprompter script={w.props?.script} wpm={w.props?.wpm} />;
    case "calculator":
      return <Calculator />;
    default:
      return <div className="widget"><h3>{w.type}</h3><div className="body" style={{ color: "var(--muted)" }}>widget not yet implemented</div></div>;
  }
}
