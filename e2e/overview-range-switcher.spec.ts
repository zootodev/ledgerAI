import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.REPRO_EMAIL;
const PASSWORD = process.env.REPRO_PASSWORD;
/** Longer than the URL assertion timeout, so the old bug cannot sneak through. */
const RSC_DELAY_MS = 2_500;

function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDay(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

async function signInAndFinishOnboarding(page: Page) {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Set REPRO_EMAIL and REPRO_PASSWORD before running this repro.");
  }

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  if (await page.getByLabel("Email").isVisible().catch(() => false)) {
    await page.getByLabel("Email").fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/(overview|onboarding)(\?|$)/, { timeout: 60_000 });
  }

  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByLabel("What does the business do?").selectOption("Retail");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Open dashboard" }).click();
    await page.waitForURL(/\/overview(\?|$)/, { timeout: 60_000 });
  }
}

test("range presets apply on the first click", async ({ page }) => {
  test.setTimeout(180_000);
  await signInAndFinishOnboarding(page);

  const today = new Date();
  const last30From = new Date(today);
  last30From.setDate(last30From.getDate() - 29);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Hold every App Router RSC response. Before the fix, router.push leaves the
  // address bar on the old URL until this response lands, which is exactly the
  // one-click lag reported on the live deploy.
  await page.route("**/overview?*", async (route) => {
    if (route.request().headers().rsc === "1") {
      await new Promise((resolve) => setTimeout(resolve, RSC_DELAY_MS));
    }
    await route.continue();
  });

  // Hard reload so no client-side transition from sign-in is still in flight.
  await page.goto(`${BASE_URL}/overview`, { waitUntil: "networkidle" });
  const fromField = page.getByLabel("From", { exact: true });

  await page.getByRole("button", { name: "Last 30 days" }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("preset") === "last30",
    // Must be shorter than the RSC delay: the URL itself has to commit now.
    { timeout: 1_000 },
  );
  await expect(fromField).toHaveValue(displayDay(isoDay(last30From)), { timeout: 15_000 });

  await page.getByRole("button", { name: "This month" }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("preset") === "month" &&
      url.searchParams.get("from") === isoDay(monthStart),
    { timeout: 1_000 },
  );
});
