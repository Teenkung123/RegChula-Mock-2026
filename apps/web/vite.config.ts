import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { searchForWorkspaceRoot } from "vite"
import { defineConfig } from "vitest/config"

const api = `http://127.0.0.1:${process.env.API_PORT ?? 3000}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.REGCHULA_WEB_PORT ?? 5173),
    strictPort: true,
    fs: { allow: [searchForWorkspaceRoot(process.cwd())] },
    proxy: {
      "/api": { target: api },
      "/openapi": { target: api },
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
