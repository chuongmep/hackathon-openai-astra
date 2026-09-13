/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig(({ mode }) => {
  // Server-only setting: the browser always calls the same-origin /api proxy.
  const env = loadEnv(mode, process.cwd(), "API_PROXY_TARGET");
  const target = env.API_PROXY_TARGET || "http://127.0.0.1:8000";
  return {
    plugins: [react()],
    worker: { format: "es" },
    optimizeDeps: {
      exclude: ["@ifc-lite/wasm"],
    },
    server: {
      host: "127.0.0.1",
      proxy: { "/api": target },
      headers: isolationHeaders,
    },
    preview: {
      proxy: { "/api": target },
      headers: isolationHeaders,
    },
  };
});
