/**
 * Dev-only mobile screenshots for the production-style app.
 *
 * Usage:
 *   npm run shots:mobile                       # production URL
 *   BASE_URL=http://localhost:3000 npm run shots:mobile
 *
 * Optional auth: run `npm run shots:auth` once and sign in manually. The saved
 * .auth/state.json (gitignored) is reused here so protected pages render.
 *
 * Output: mobile-shots/<device>/<route-slug>.png (gitignored).
 */
import { chromium, devices, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

const DEFAULT_BASE_URL = "https://ledgerai-zootodev.vercel.app";
const AUTH_STATE_PATH = path.resolve(process.cwd(), ".auth/state.json");
const SHOTS_DIR = path.resolve(process.cwd(), "mobile-shots");

/** Main public + authenticated pages. There is no admin surface in this app. */
const ROUTES = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/privacy",
  "/terms",
  "/overview",
  "/transactions",
  "/income",
  "/expenses",
  "/reports",
  "/import",
  "/insights",
  "/settings",
  "/settings/profile",
  "/settings/accounts",
  "/settings/categories",
  "/settings/business",
  "/settings/rules",
  "/settings/security",
  "/settings/account",
] as const;

const PROTECTED_ROUTES = new Set<string>([
  "/overview",
  "/transactions",
  "/income",
  "/expenses",
  "/reports",
  "/import",
  "/insights",
  "/settings",
  "/settings/profile",
  "/settings/accounts",
  "/settings/categories",
  "/settings/business",
  "/settings/rules",
  "/settings/security",
  "/settings/account",
]);

const DEVICES = [
  { label: "iPhone 13", dir: "iphone-13", profile: devices["iPhone 13"] },
  { label: "Pixel 7", dir: "pixel-7", profile: devices["Pixel 7"] },
] as const;

interface Overflow {
  device: string;
  route: string;
  scrollWidth: number;
  innerWidth: number;
}

interface CardOverflow {
  device: string;
  route: string;
  card: string;
  element: string;
  cardRight: number;
  elementRight: number;
}

interface Failure {
  device: string;
  route: string;
  message: string;
}

/** "/settings/profile" -> "settings-profile"; "/" -> "home". */
export function routeSlug(route: string): string {
  if (route === "/") return "home";
  return route
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load").catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
  }).catch(() => undefined);
  // Let client-side charts, skeletons and the range control finish swapping in.
  await page.waitForTimeout(750);
}

async function measureOverflow(page: Page): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

async function measureCardOverflows(page: Page): Promise<
  Array<{
    card: string;
    element: string;
    cardRight: number;
    elementRight: number;
  }>
> {
  return page.evaluate(() => {
    const describe = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const cls = typeof el.className === "string" ? el.className : "";
      const parts = cls.split(/\s+/).filter(Boolean).slice(0, 4);
      const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${tag}${parts.length ? "." + parts.join(".") : ""}${text ? ` "${text}"` : ""}`;
    };

    const hasScrollableAncestor = (el: Element, boundary: Element): boolean => {
      let p: Element | null = el.parentElement;
      while (p && p !== boundary) {
        const style = window.getComputedStyle(p);
        if (/(auto|scroll)/.test(style.overflowX)) return true;
        p = p.parentElement;
      }
      return false;
    };

    const results: Array<{
      card: string;
      element: string;
      cardRight: number;
      elementRight: number;
    }> = [];
    const seen = new Set<string>();
    const cards = Array.from(document.querySelectorAll('[class*="rounded-card"]'));

    for (const card of cards) {
      const cardEl = card as HTMLElement;
      if (cardEl.offsetWidth === 0 || cardEl.offsetHeight === 0) continue;
      const cardStyle = window.getComputedStyle(cardEl);
      if (cardStyle.display === "none" || cardStyle.visibility === "hidden") continue;

      const cardRect = cardEl.getBoundingClientRect();
      const descendants = cardEl.querySelectorAll("*");
      for (const node of Array.from(descendants)) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.offsetWidth === 0 || node.offsetHeight === 0) continue;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (style.position === "fixed") continue;

        const rect = node.getBoundingClientRect();
        if (rect.right <= cardRect.right + 1) continue;
        if (hasScrollableAncestor(node, cardEl)) continue;

        const key = `${describe(card)}|${describe(node)}|${Math.round(rect.right)}|${Math.round(cardRect.right)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({
          card: describe(cardEl),
          element: describe(node),
          cardRight: Math.round(cardRect.right),
          elementRight: Math.round(rect.right),
        });
      }
    }

    return results;
  });
}

async function captureMenu(
  page: Page,
  baseUrl: string,
  deviceDir: string,
  failures: Failure[],
  label: string,
): Promise<void> {
  if (!existsSync(AUTH_STATE_PATH)) {
    console.log(`[nav] ${label}: skipped (no .auth/state.json; run npm run shots:auth)`);
    return;
  }

  try {
    await page.goto(`${baseUrl}/overview`, { waitUntil: "load", timeout: 45_000 });
    await settle(page);

    if (new URL(page.url()).pathname === "/login") {
      console.log(`[nav] ${label}: skipped (session expired; re-run npm run shots:auth)`);
      return;
    }

    const toggle = page.getByRole("button", { name: "Toggle navigation" });
    await toggle.click();
    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await dialog.waitFor();

    const file = path.join(SHOTS_DIR, deviceDir, "nav-menu.png");
    await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
    console.log(`[nav] ${label}: mobile menu -> ${path.relative(process.cwd(), file)}`);

    await page.getByRole("button", { name: "Close navigation" }).click();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ device: label, route: "mobile nav", message });
    console.error(`[nav] ${label}: failed — ${message}`);
  }
}

async function captureDevice(
  browser: Browser,
  device: (typeof DEVICES)[number],
  baseUrl: string,
  authState: string | undefined,
  overflows: Overflow[],
  cardOverflows: CardOverflow[],
  failures: Failure[],
): Promise<void> {
  await mkdir(path.join(SHOTS_DIR, device.dir), { recursive: true });

  const context: BrowserContext = await browser.newContext({
    ...device.profile,
    storageState: authState,
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);

    for (const route of ROUTES) {
      const url = `${baseUrl}${route}`;
      try {
        const response = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
        await settle(page);

        const landed = new URL(page.url()).pathname;
        if (PROTECTED_ROUTES.has(route) && landed === "/login") {
          console.warn(`[auth] ${device.label} ${route}: redirected to /login`);
        }

        const file = path.join(SHOTS_DIR, device.dir, `${routeSlug(route)}.png`);
        await page.screenshot({ path: file, fullPage: true, animations: "disabled" });

        const { scrollWidth, innerWidth } = await measureOverflow(page);
        if (scrollWidth > innerWidth) {
          overflows.push({ device: device.label, route, scrollWidth, innerWidth });
          console.warn(
            `[overflow] ${device.label} ${route}: ${scrollWidth} > ${innerWidth}`,
          );
        }

        const cardIssues = await measureCardOverflows(page).catch(() => []);
        for (const issue of cardIssues) {
          cardOverflows.push({ device: device.label, route, ...issue });
          console.warn(
            `[card-overflow] ${device.label} ${route}: ${issue.element} (${issue.elementRight}px) > card ${issue.card} (${issue.cardRight}px)`,
          );
        }

        const status = response?.status() ?? "no response";
        console.log(`✓ ${device.label} ${route} (${status}) -> ${path.relative(process.cwd(), file)}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ device: device.label, route, message });
        console.error(`✗ ${device.label} ${route}: ${message}`);
      }
    }

    await captureMenu(page, baseUrl, device.dir, failures, device.label);
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(process.env.BASE_URL ?? DEFAULT_BASE_URL);
  const authState = existsSync(AUTH_STATE_PATH) ? AUTH_STATE_PATH : undefined;

  console.log(`Base URL: ${baseUrl}`);
  console.log(`Auth state: ${authState ? path.relative(process.cwd(), authState) : "none (public pages only)"}`);
  console.log(`Output: ${path.relative(process.cwd(), SHOTS_DIR)}\n`);

  await mkdir(SHOTS_DIR, { recursive: true });

  const overflows: Overflow[] = [];
  const cardOverflows: CardOverflow[] = [];
  const failures: Failure[] = [];
  const browser = await chromium.launch();

  try {
    for (const device of DEVICES) {
      console.log(`\n== ${device.label} ==`);
      await captureDevice(browser, device, baseUrl, authState, overflows, cardOverflows, failures);
    }
  } finally {
    await browser.close();
  }

  console.log(`\nScreenshots: ${SHOTS_DIR}`);

  if (overflows.length > 0) {
    console.log("\nHorizontal overflow:");
    for (const item of overflows) {
      console.log(
        `- ${item.device} ${item.route} (scrollWidth ${item.scrollWidth} > innerWidth ${item.innerWidth})`,
      );
    }
  } else {
    console.log("\nHorizontal overflow: none detected.");
  }

  if (cardOverflows.length > 0) {
    console.log("\nElements overflowing their card:");
    for (const item of cardOverflows) {
      console.log(
        `- ${item.device} ${item.route}: ${item.element} (${item.elementRight}px) > ${item.card} (${item.cardRight}px)`,
      );
    }
  } else {
    console.log("\nCard overflow: none detected.");
  }

  if (failures.length > 0) {
    console.error("\nFailed captures:");
    for (const item of failures) {
      console.error(`- ${item.device} ${item.route}: ${item.message}`);
    }
    process.exitCode = 1;
  }
  if (overflows.length > 0 || cardOverflows.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
