import { defineConfig } from "electron-vite";

// Three logical builds: main (Node), preload (bridge), renderer (Chromium/WebGL).
// `three` is pinned + dedup'd so the VRM avatar and the force-graph share ONE
// three.js instance (ADR D4 — the #1 integration pitfall otherwise).
export default defineConfig({
  main: {
    build: { outDir: "out/main", lib: { entry: "src/main/index.ts" } },
  },
  preload: {
    build: { outDir: "out/preload", lib: { entry: "src/preload/index.ts" } },
  },
  renderer: {
    root: "src/renderer",
    resolve: { dedupe: ["three"] },
    build: {
      outDir: "out/renderer",
      rollupOptions: { input: "src/renderer/index.html" },
    },
  },
});
