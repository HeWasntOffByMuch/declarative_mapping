import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `/api/*` is served by the local backend in `server/` (run `npm run
// dev:server`). It generates the SceneSpec via your Claude Code login by
// default, so the frontend never handles a key.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
