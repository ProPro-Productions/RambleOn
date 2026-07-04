import fs from "fs";
import { createRequire } from "module";
import path from "path";

import { agentNative } from "@agent-native/core/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";

import { rambleOnBranding } from "./branding";

const reactRouterPlugins = reactRouter as unknown as () => any[];
const agentNativePlugins = agentNative as unknown as (
  options?: Parameters<typeof agentNative>[0],
) => any[];

const _require = createRequire(import.meta.url);
const ffmpegDir = path.resolve(
  path.dirname(_require.resolve("@ffmpeg/ffmpeg")),
  "../..",
);

// Self-host the MediaPipe WASM at /mediapipe/wasm by copying it out of the
// installed package at dev/build start, rather than committing ~21MB or loading
// from a CDN. Gitignored; the small model is vendored in public/mediapipe/.
const MEDIAPIPE_WASM_FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

function copyMediapipeWasm(): Plugin {
  return {
    name: "clips-copy-mediapipe-wasm",
    buildStart() {
      try {
        const wasmSrc = path.join(
          path.dirname(_require.resolve("@mediapipe/tasks-vision")),
          "wasm",
        );
        const wasmDest = path.resolve(
          import.meta.dirname,
          "public/mediapipe/wasm",
        );
        fs.mkdirSync(wasmDest, { recursive: true });
        for (const file of MEDIAPIPE_WASM_FILES) {
          fs.copyFileSync(path.join(wasmSrc, file), path.join(wasmDest, file));
        }
      } catch (err) {
        // Don't fail the build — camera blur degrades to recording un-blurred.
        this.warn(`could not copy MediaPipe WASM assets: ${err}`);
      }
    },
  };
}

export default defineConfig({
  // Clips' assigned dev port from shared-app-config/templates.ts (devPort).
  // Keeping plain `pnpm dev` on the same port as the workspace dev runner
  // means the desktop app's dev default URL works in both flows.
  server: { port: 8094 },
  plugins: [
    rambleOnBranding(),
    ...reactRouterPlugins(),
    ...agentNativePlugins({
      // shiki only runs in AssistantChat's useEffect — keep it out of the
      // CF Pages Functions bundle (25 MiB limit).
      ssrStubs: ["shiki"],
      fsAllow: [ffmpegDir],
    }),
    copyMediapipeWasm(),
  ],
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
});
