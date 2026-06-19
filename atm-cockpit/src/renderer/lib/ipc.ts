// Typed access to the preload bridge. The renderer can ONLY do what the bridge
// exposes (no fs/exec/key) — ADR D3.
export interface CockpitApi {
  graphExport(limit?: number): Promise<any>;
  recall(query: string, opts?: object): Promise<any>;
  startTurn(turnId: string, utterance: string): void;
  onTurn(cb: (e: any) => void): () => void;
  onAnimateGraph(cb: (e: any) => void): () => void;
  onOpenWidget(cb: (e: any) => void): () => void;
}

export const cockpit: CockpitApi = (globalThis as any).cockpit ?? {
  // dev/headless stub so the module imports without Electron present
  graphExport: async () => ({ schema: "graph.export/1", nodes: [], edges: [] }),
  recall: async () => ({ results: [], trace: null }),
  startTurn: () => {},
  onTurn: () => () => {},
  onAnimateGraph: () => () => {},
  onOpenWidget: () => () => {},
};

export const newTurnId = () => "t" + Date.now().toString(36);
