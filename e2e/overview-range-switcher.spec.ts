import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.REPRO_EMAIL;
const PASSWORD = process.env.REPRO_PASSWORD;
/** Longer than the URL assertion timeout, so the old bug cannot sneak through. */
const RSC_DELAY_MS = 2_500;
const STORAGE_STATE = process.env.REPRO_STORAGE_STATE;

// A saved session is useful for local repros; CI/live runs keep the password
// sign-in path below. Either way the test starts from a real, hard-loaded page.
if (STORAGE_STATE) test.use({ storageState: STORAGE_STATE });

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

interface ExpectedRange {
  id: "last30" | "month" | "last90";
  label: string;
  from: string;
  to: string;
  /** Any comparison phrase that is correct for this range. */
  comparisons: string[];
}

async function signInAndFinishOnboarding(page: Page) {
  if (!STORAGE_STATE) {
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
  } else {
    await page.goto(`${BASE_URL}/overview`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/overview(\?|$)/, { timeout: 60_000 });
  }

  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByLabel("What does the business do?").selectOption("Retail");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Open dashboard" }).click();
    await page.waitForURL(/\/overview(\?|$)/, { timeout: 60_000 });
  }
}

/**
 * Wait for the App Router navigation to settle, then check the URL AND the
 * server-rendered content together. A one-click lag fails here: the URL can
 * change immediately while the fields, tiles and charts still show the old
 * range.
 */
async function expectRangeApplied(page: Page, expected: ExpectedRange) {
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("preset") === expected.id &&
      url.searchParams.get("from") === expected.from &&
      url.searchParams.get("to") === expected.to,
    { timeout: 20_000 },
  );

  const fromField = page.getByLabel("From", { exact: true });
  const toField = page.getByLabel("To", { exact: true });
  await expect(fromField).toHaveValue(displayDay(expected.from), { timeout: 20_000 });
  await expect(toField).toHaveValue(displayDay(expected.to), { timeout: 20_000 });

  const revenueBadge = page.getByRole("group", { name: /^Revenue:/ });
  const labelPattern = new RegExp(
    `vs (?:${expected.comparisons.map((c) => c.replace(/^vs /, "")).join("|")})`,
  );
  await expect
    .poll(
      async () => {
        const label = await revenueBadge.getAttribute("aria-label");
        if (!label) return "";
        // Accounts with no revenue in the prior window render "No change" or
        // "New" instead of a comparison. That is still settled content; a
        // stale comparison from the previous preset must never survive.
        if (!/vs (?:previous|last) /.test(label)) {
          return /No change|New|Up from|Down from/.test(label) ? label : "";
        }
        return labelPattern.test(label) ? label : "";
      },
      { timeout: 20_000, message: `Revenue badge must match ${labelPattern}` },
    )
    .not.toBe("");

  // The optimistic pill is a native button attribute, not just a CSS class.
  await expect(page.getByRole("button", { name: expected.label })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

/** The line chart's last partial-month tick must fit inside its own SVG. */
async function expectLastProfitTickFits(page: Page) {
  const overflow = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("section, div")].filter(
      (el) =>
        /^Profit over time$/.test(el.querySelector("h3")?.textContent?.trim() ?? "") &&
        el.querySelector("svg.recharts-surface"),
    );
    const svg = cards.at(-1)?.querySelector("svg.recharts-surface");
    if (!svg) return Number.POSITIVE_INFINITY;
    const svgRight = svg.getBoundingClientRect().right;
    return [...svg.querySelectorAll("text")]
      .filter((text) => text.textContent?.includes("to "))
      .reduce((worst, text) => Math.max(worst, text.getBoundingClientRect().right - svgRight), 0);
  });
  expect(overflow, "last profit tick is clipped at the card edge").toBeLessThanOrEqual(0);
}

test("range presets apply URL, dates and tiles on the first click", async ({ page }) => {
  test.setTimeout(180_000);
  await signInAndFinishOnboarding(page);

  const today = new Date();
  const daysBefore = (days: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return isoDay(date);
  };
  const last30: ExpectedRange = {
    id: "last30",
    label: "Last 30 days",
    from: daysBefore(29),
    to: isoDay(today),
    comparisons: ["previous 30 days"],
  };
  const month: ExpectedRange = {
    id: "month",
    label: "This month",
    from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: isoDay(today),
    // A partial month is labelled by its day count; whole months say "last month".
    comparisons: [
      `previous ${today.getDate()} days`,
      "previous month",
      "last month",
    ],
  };
  const last90: ExpectedRange = {
    id: "last90",
    label: "Last 90 days",
    from: daysBefore(89),
    to: isoDay(today),
    comparisons: ["previous 90 days"],
  };

  // Hold every App Router RSC response. With router.push the address bar waits
  // for this response; with the old pushState + refresh pair it changed early
  // while the server payload still described the PREVIOUS URL.
  await page.route("**/overview?*", async (route) => {
    if (route.request().headers().rsc === "1") {
      await new Promise((resolve) => setTimeout(resolve, RSC_DELAY_MS));
    }
    await route.continue();
  });

  // Hard reload so no client-side transition from sign-in is still in flight.
  await page.goto(`${BASE_URL}/overview`, { waitUntil: "load" });
  await expect(page.getByLabel("From", { exact: true })).toBeVisible({ timeout: 60_000 });

  async function clickPreset(expected: ExpectedRange) {
    const pill = page.getByRole("button", { name: expected.label });
    await pill.click();
    // Also proves the click reached hydrated React: the optimistic highlight
    // and pending spinner both appear before the delayed RSC response lands.
    await expect(pill).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });
    expect(await pill.ariaSnapshot(), "pressed state must reach the accessibility tree").toContain(
      "[pressed]",
    );
    await expect(pill).toHaveAttribute("data-pending", "true", { timeout: 5_000 });
  }

  await clickPreset(last30);
  await expectRangeApplied(page, last30);

  await clickPreset(month);
  await expectRangeApplied(page, month);

  await clickPreset(last90);
  await expectRangeApplied(page, last90);

  // Back/forward must move the server-rendered tiles too, not only the URL.
  await page.goBack();
  await expectRangeApplied(page, month);

  await page.goForward();
  await expectRangeApplied(page, last90);

  // The line chart used to lose "st)" off "to 21st" at both widths.
  await expectLastProfitTickFits(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1_000);
  await expectLastProfitTickFits(page);
});
