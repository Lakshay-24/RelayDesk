import { defineConfig, devices } from "@playwright/test";

const local = process.env.RELAYDESK_E2E_LOCAL === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.RELAYDESK_BASE_URL || "https://relay-desk-mjq6.vercel.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: local ? {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 60_000,
  } : undefined,
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
