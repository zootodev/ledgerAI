import { defineConfig, devices } from "@playwright/test";

/**
 * Desktop keeps the range/repro flow; mobile projects verify the native date
 * picker is reachable by a real tap on the icon area.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  reporter: process.env.CI ? "github" : "line",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /overview-range-switcher\.spec\.ts/,
    },
    {
      name: "webkit-iphone-13",
      use: { ...devices["iPhone 13"] },
      testMatch: /date-picker-mobile\.spec\.ts/,
    },
    {
      name: "chromium-pixel-7",
      use: { ...devices["Pixel 7"] },
      testMatch: /date-picker-mobile\.spec\.ts/,
    },
  ],
});
