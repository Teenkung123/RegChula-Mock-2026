import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, searchForWorkspaceRoot } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.REGCHULA_STAFF_PORT ?? 5174),
    strictPort: true,
    fs: { allow: [searchForWorkspaceRoot(process.cwd())] },
    proxy: { "/api": { target: `http://127.0.0.1:${process.env.API_PORT ?? 3000}` } },
  },
  build: { sourcemap: true },
})
