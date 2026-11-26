import { defineConfig, devices } from "@playwright/test";

/**
 * Desktop covers the range flow and grouped review; mobile projects verify
 * the native date picker is reachable by a real tap on the icon area and that
 * grouped review fits a 390px viewport.
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
      testMatch: /(overview-range-switcher|review-bulk)\.spec\.ts/,
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
    {
      name: "chromium-390-review",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
      testMatch: /review-bulk\.spec\.ts/,
    },
  ],
});
