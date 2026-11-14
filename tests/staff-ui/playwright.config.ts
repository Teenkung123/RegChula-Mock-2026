import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 30000,
  expect: { timeout: 8000 },
  reporter: "list",
  outputDir: "../../tmp/staff-ui-results",
  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
})
