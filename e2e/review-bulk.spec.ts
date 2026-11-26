import { expect, test, type Page } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const STORAGE_STATE = process.env.REPRO_STORAGE_STATE;

if (STORAGE_STATE) test.use({ storageState: STORAGE_STATE });

async function readBannerGroups(page: Page): Promise<number> {
  const text = await page.getByText(/need a quick check/).textContent();
  const match = text?.match(/(\d+)\s+groups?/);
  return Number(match?.[1] ?? 0);
}

async function waitForOverviewHydration(page: Page) {
  await page.waitForFunction(() => {
    const link = document.querySelector('a[href="/review"]');
    return Boolean(link && Object.keys(link).some((key) => key.startsWith("__reactProps")));
  }, undefined, { timeout: 60_000 });
  await page.waitForTimeout(1_000);
}

async function waitForReviewHydration(page: Page) {
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-review-group] button");
    return Boolean(button && Object.keys(button).some((key) => key.startsWith("__reactProps")));
  }, undefined, { timeout: 60_000 });
  // Props are attached before delegated event handlers finish settling.
  await page.waitForTimeout(1_500);
}

async function expectNoOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(sizes.scrollWidth, "no horizontal overflow on a narrow viewport").toBeLessThanOrEqual(
    sizes.viewport,
  );
}

test("banner → group accept → undo → accept again → lower banner count", async ({ page }) => {
  await page.goto(`${BASE_URL}/overview`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  const banner = page.getByText(/need a quick check/);
  await expect(banner).toBeVisible({ timeout: 60_000 });
  const initialGroups = await readBannerGroups(page);
  expect(initialGroups, "the seeded tenant has low-confidence groups").toBeGreaterThan(0);
  await waitForOverviewHydration(page);

  // WebKit/mobile can drop a click while hydration settles; retry the link.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByRole("link", { name: "Start review" }).click();
    if (page.url().endsWith("/review")) break;
    await page.waitForTimeout(1_500);
  }
  await expect(page).toHaveURL(/\/review/, { timeout: 30_000 });
  await expect(page.locator("[data-review-group]").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-review-progress]")).toContainText(/0 of \d+ groups done/);
  await waitForReviewHydration(page);

  await page.getByRole("button", { name: /Accept all \d+/ }).first().click();
  await expect(page.getByText(/rows? reviewed/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(page.locator("[data-review-progress]")).toContainText(/1 of \d+ groups done/);

  // The undo toast is available for ~10 seconds and restores the exact rows.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Review restored")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-review-progress]")).toContainText(/0 of \d+ groups done/);

  await page.getByRole("button", { name: /Accept all \d+/ }).first().click();
  await expect(page.getByText(/rows? reviewed/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-review-progress]")).toContainText(/1 of \d+ groups done/);
  await expectNoOverflow(page);

  await page.goto(`${BASE_URL}/overview`, { waitUntil: "domcontentloaded" });
  await expect(banner).toBeVisible({ timeout: 60_000 });
  expect(await readBannerGroups(page)).toBeLessThan(initialGroups);
});
