import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  outputDir: "../../tmp/student-ux-results",
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: { viewport: { width: 375, height: 900 }, isMobile: true, hasTouch: true },
    },
  ],
})
