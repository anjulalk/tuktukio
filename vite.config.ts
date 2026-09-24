import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 600,
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
  },
});
