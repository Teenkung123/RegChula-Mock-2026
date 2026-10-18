import { resolve } from "node:path"
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./planning",
  testMatch: "personal-planning.spec.ts",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  workers: 1,
  use: {
    baseURL: "http://localhost:5175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "bun run apps/api/src/index.ts",
      cwd: resolve(__dirname, ".."),
      url: "http://localhost:3015/api/v1/health/ready",
      env: { API_PORT: "3015", WEB_ORIGIN: "http://localhost:5175" },
      timeout: 60_000,
    },
    {
      command:
        "node apps/web/node_modules/vite/bin/vite.js --config tests/planning.vite.config.mts",
      cwd: resolve(__dirname, ".."),
      url: "http://localhost:5175",
      timeout: 60_000,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-375", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
})
