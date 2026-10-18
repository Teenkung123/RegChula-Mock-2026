import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { searchForWorkspaceRoot } from "vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["main-pc.taila84498.ts.net", "regchula.nthpn.com"],
    port: 5173,
    strictPort: true,
    fs: { allow: [searchForWorkspaceRoot(process.cwd())] },
    proxy: {
      "/api": { target: "http://127.0.0.1:3000" },
      "/openapi": { target: "http://127.0.0.1:3000" },
    },
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 400,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
})
