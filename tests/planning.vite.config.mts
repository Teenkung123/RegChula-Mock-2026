import base from "../apps/web/vite.config.ts"
import { fileURLToPath } from "node:url"

export default {
  ...base,
  root: fileURLToPath(new URL("../apps/web", import.meta.url)),
  server: {
    ...base.server,
    port: 5175,
    hmr: { clientPort: 5175 },
    proxy: {
      "/api": { target: "http://127.0.0.1:3015" },
      "/openapi": { target: "http://127.0.0.1:3015" },
    },
  },
}
