import { expect, test, type Page } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const STORAGE_STATE = process.env.REPRO_STORAGE_STATE;

if (STORAGE_STATE) test.use({ storageState: STORAGE_STATE });

async function openOverview(page: Page) {
  await page.goto(`${BASE_URL}/overview`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForSelector('input[placeholder="DD/MM/YYYY"]', { timeout: 60_000 });
  // React attaches props to the DOM node only after hydration; filling before
  // that point is ignored by the controlled input.
  await page.waitForFunction(
    () => {
      const button = document.querySelector("[data-date-field] button");
      return Boolean(button && Object.keys(button).some((key) => key.startsWith("__reactProps")));
    },
    undefined,
    { timeout: 60_000 },
  );
  // Props appear before event delegation finishes settling in WebKit.
  await page.waitForTimeout(3_000);
}

/** The icon centre must hit the real date input, never the visual button. */
async function expectNativeInputAtIcon(page: Page) {
  const button = page.getByLabel("Choose date").first();
  await expect(button).toBeVisible();
  const icon = await button.boundingBox();
  if (!icon) throw new Error("Calendar icon has no box");

  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const owner = el?.closest("input,button");
    return {
      tag: el?.tagName,
      ownerTag: owner?.tagName,
      ownerType: owner?.getAttribute("type"),
      fontSize: owner ? Number.parseFloat(getComputedStyle(owner).fontSize) : 0,
    };
  }, { x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 });

  expect(hit.ownerTag).toBe("INPUT");
  expect(hit.ownerType).toBe("date");
  expect(hit.fontSize).toBeGreaterThanOrEqual(16);
  expect(icon.width).toBeLessThanOrEqual(40);

  // The rest of the field stays available for typing DD/MM/YYYY.
  const text = page.locator('input[placeholder="DD/MM/YYYY"]').first();
  const textBox = await text.boundingBox();
  if (!textBox) throw new Error("From field has no box");
  const textHit = await page.evaluate(({ x, y }) => {
    const owner = document.elementFromPoint(x, y)?.closest("input,button");
    return { type: owner?.getAttribute("type"), placeholder: owner?.getAttribute("placeholder") };
  }, { x: textBox.x + 12, y: textBox.y + textBox.height / 2 });
  expect(textHit.type).toBe("text");
  expect(textHit.placeholder).toBe("DD/MM/YYYY");
}

const displayDay = (iso: string) =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** WebKit can drop the first input event while hydration settles; retry it. */
async function fillPicker(page: Page, index: number, iso: string) {
  const picker = page.locator('input[type="date"]').nth(index);
  const visible = page.locator('input[placeholder="DD/MM/YYYY"]').nth(index);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // Bypass React's value tracker so a repeated fill still dispatches input.
    await picker.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, iso);
    await page.waitForTimeout(1_200);
    if ((await visible.inputValue()) === displayDay(iso)) return;
  }
}

async function pickBothDates(page: Page, from: string, to: string) {
  await fillPicker(page, 0, from);
  await expect(page.locator('input[placeholder="DD/MM/YYYY"]').nth(0)).toHaveValue(
    displayDay(from),
    { timeout: 20_000 },
  );
  await fillPicker(page, 1, to);
  await expect(page.locator('input[placeholder="DD/MM/YYYY"]').nth(1)).toHaveValue(
    displayDay(to),
    { timeout: 20_000 },
  );
  await expect(
    page,
    "picked dates must reach the URL as well as the visible fields",
  ).toHaveURL(
    (url) => url.searchParams.get("from") === from && url.searchParams.get("to") === to,
    { timeout: 20_000 },
  );
}

test("iPhone 13 / WebKit opens the native picker from the icon", async ({ page }, info) => {
  test.skip(info.project.name !== "webkit-iphone-13", "iPhone 13 WebKit project only");
  await openOverview(page);
  await expectNativeInputAtIcon(page);
  await pickBothDates(page, "2026-11-20", "2026-11-25");
});

test("Pixel 7 / Chromium opens the native picker from the icon", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium-pixel-7", "Pixel 7 Chromium project only");
  await openOverview(page);
  await expectNativeInputAtIcon(page);
  await pickBothDates(page, "2026-11-18", "2026-11-24");
});
