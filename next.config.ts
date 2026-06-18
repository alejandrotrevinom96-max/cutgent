import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remotion's renderer/bundler must stay external on the server (they use
  // native binaries + headless Chromium and must not be webpack-bundled).
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "esbuild",
    "ffmpeg-static",
    "@huggingface/transformers",
    "onnxruntime-node",
    "sharp",
  ],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
