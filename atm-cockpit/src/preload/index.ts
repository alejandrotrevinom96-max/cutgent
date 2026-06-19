// Preload bridge (ADR D3 security): the renderer gets ONLY these typed channels.
// No fs, no child_process, no API key, no brain handle — just events in/out.
import { contextBridge, ipcRenderer } from "electron";

const api = {
  // read-only brain ops for the graph + recall panels
  graphExport: (limit?: number) => ipcRenderer.invoke("brain:graphExport", limit),
  recall: (query: string, opts?: object) => ipcRenderer.invoke("brain:recall", query, opts),
  // start a conversational/agent turn from a spoken or typed utterance
  startTurn: (turnId: string, utterance: string) => ipcRenderer.send("turn:start", { turnId, utterance }),
  // subscribe to turn lifecycle + UI effect events
  onTurn: (cb: (e: any) => void) => sub("turn", cb),
  onAnimateGraph: (cb: (e: any) => void) => sub("ui/animate_graph", cb),
  onOpenWidget: (cb: (e: any) => void) => sub("ui/open_widget", cb),
};

function sub(channel: string, cb: (e: any) => void) {
  const handler = (_evt: unknown, payload: any) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("cockpit", api);
export type CockpitApi = typeof api;
