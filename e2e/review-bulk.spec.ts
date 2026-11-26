import { expect, test, type Page } from "@playwright/test";
import { MUTATION_SKIP_REASON, mutationTargetAllowed } from "./mutation-guard";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const STORAGE_STATE = process.env.REPRO_STORAGE_STATE;

if (STORAGE_STATE) test.use({ storageState: STORAGE_STATE });

async function readBannerGroups(page: Page): Promise<number> {
  const text = await page.getByText(/need a quick check/).textContent();
  const match = text?.match(/(\d+)\s+groups?/);
  return Number(match?.[1] ?? 0);
}

async function expectStartReviewReachable(page: Page) {
  const link = page.getByRole("link", { name: "Start review" });
  await expect(link).toBeVisible({ timeout: 60_000 });
  const hit = await link.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return element === top || element.contains(top);
  });
  expect(hit, "no overlay intercepts the Start review link").toBe(true);
  return link;
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
  // Accepting a group writes to the live review queue: skip unless the target
  // is explicitly local/safe.
  test.skip(!mutationTargetAllowed(), MUTATION_SKIP_REASON);
  await page.goto(`${BASE_URL}/overview`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  const banner = page.getByText(/need a quick check/);
  await expect(banner).toBeVisible({ timeout: 60_000 });
  const initialGroups = await readBannerGroups(page);
  expect(initialGroups, "the seeded tenant has low-confidence groups").toBeGreaterThan(0);
  const startReview = await expectStartReviewReachable(page);
  await startReview.click();
  await expect(page).toHaveURL(/\/review/, { timeout: 30_000 });
  await expect(page.locator("[data-review-group]").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-review-progress]")).toContainText(/0 of \d+ groups done/);
  await expect(page.locator("[data-review-progress]")).toHaveAttribute(
    "aria-label",
    /0 of \d+ groups done, \d+ rows left/,
  );
  await expect(page.locator("[data-review-group] p[aria-label]").first()).toHaveAttribute(
    "aria-label",
    /\d+ (row|rows), (Income|Expense|Transfer)/,
  );
  await waitForReviewHydration(page);

  await page.getByRole("button", { name: /Accept all \d+/ }).first().click();
  await expect(page.getByText(/rows? reviewed/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(page.locator("[data-review-progress]")).toContainText(/1 of \d+ groups done/);

  // The undo toast is available for ~10 seconds and restores the exact rows.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/\d+ rows restored/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-review-progress]")).toContainText(/0 of \d+ groups done/);

  await page.getByRole("button", { name: /Accept all \d+/ }).first().click();
  await expect(page.getByText(/rows? reviewed/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-review-progress]")).toContainText(/1 of \d+ groups done/);
  await expectNoOverflow(page);

  await page.goto(`${BASE_URL}/overview`, { waitUntil: "domcontentloaded" });
  await expect(banner).toBeVisible({ timeout: 60_000 });
  expect(await readBannerGroups(page)).toBeLessThan(initialGroups);

  // Keyboard users get the same plain navigation, with no hydration race.
  const keyboardLink = await expectStartReviewReachable(page);
  await keyboardLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/review/, { timeout: 30_000 });
});
