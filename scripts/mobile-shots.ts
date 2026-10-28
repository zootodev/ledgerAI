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
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_BASE_URL = "https://ledgerai-zootodev.vercel.app";
const AUTH_STATE_PATH = path.resolve(process.cwd(), ".auth/state.json");
const SHOTS_DIR = path.resolve(process.cwd(), "mobile-shots");

// Passed to page.evaluate() as source. It must stay outside the TypeScript
// bundle: esbuild's keepNames helper (__name) is not available in the page.
const OVERFLOW_CHECK_SOURCE = readFileSync(
  path.join(process.cwd(), "scripts", "overflow-check.js"),
  "utf8",
);

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
  kind?: "viewport" | "container";
  element: string;
  selectorPath?: string;
  text?: string;
  overflowPx?: number;
  container?: string;
  containerRight?: number;
  elementRight?: number;
}

interface OverflowHit {
  kind: "viewport" | "container";
  selectorPath: string;
  element: string;
  text: string;
  overflowPx: number;
  container?: string;
  containerRight?: number;
  elementRight?: number;
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
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() =>
    page.waitForLoadState("load").catch(() => undefined),
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
  }).catch(() => undefined);
  // Let client-side charts, skeletons and the range control finish swapping in.
  await page.waitForTimeout(1500);
  // Wait for skeletons/placeholders to disappear if present
  await page
    .waitForFunction(
      () => {
        const skeletons = document.querySelectorAll(
          '.animate-pulse, [data-skeleton], .skeleton',
        );
        if (skeletons.length === 0) return true;
        for (const el of Array.from(skeletons)) {
          const style = window.getComputedStyle(el as Element);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return false;
          }
        }
        return true;
      },
      { timeout: 20_000 },
    )
    .catch(() => undefined);
}

async function measureOverflow(page: Page): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

async function measureOverflows(page: Page): Promise<OverflowHit[]> {
  return (await page.evaluate(OVERFLOW_CHECK_SOURCE)) as OverflowHit[];
}

function recordOverflowHits(
  device: string,
  route: string,
  issues: OverflowHit[],
  target: CardOverflow[],
): void {
  for (const issue of issues) {
    target.push({ device, route, ...issue });
    console.warn(
      `[${issue.kind}-overflow] ${device} ${route}: ${issue.selectorPath} "${issue.text}" | ${issue.element} overflows by ${Math.round(issue.overflowPx)}px (container:${issue.container ?? "?"})`,
    );
  }
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

async function captureSettingsTabs(
  page: Page,
  baseUrl: string,
  deviceDir: string,
  deviceLabel: string,
  cardOverflows: CardOverflow[],
  failures: Failure[],
): Promise<void> {
  if (!existsSync(AUTH_STATE_PATH)) return;
  const tabs = ["profile", "business", "accounts", "categories", "rules", "security", "account"] as const;
  const tabLabels: Record<(typeof tabs)[number], string> = {
    profile: "Profile",
    business: "Business",
    accounts: "Accounts",
    categories: "Categories",
    rules: "Rules",
    security: "Security",
    account: "Account",
  };

  try {
    await page.goto(`${baseUrl}/settings/profile`, { waitUntil: "load", timeout: 45_000 });
    await settle(page);
    if (new URL(page.url()).pathname === "/login") {
      console.warn(`[auth] ${deviceLabel} settings: session expired; re-run npm run shots:auth`);
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ device: deviceLabel, route: "settings", message });
    console.error(`✗ ${deviceLabel} settings: ${message}`);
    return;
  }

  for (const tab of tabs) {
    const route = `settings/${tab}`;
    try {
      if (tab !== "profile") {
        // Click through the real tab row (exercises client navigation and the
        // active-tab scroll-into-view behavior) instead of only deep-linking.
        await page.getByRole("tab", { name: tabLabels[tab], exact: true }).click();
        await page
          .waitForURL((url) => url.pathname === `/settings/${tab}`, { timeout: 20_000 })
          .catch(() => undefined);
        await settle(page);
      }

      // Fall back to a direct load if client navigation did not land.
      if (new URL(page.url()).pathname !== `/settings/${tab}`) {
        await page.goto(`${baseUrl}/settings/${tab}`, {
          waitUntil: "load",
          timeout: 45_000,
        });
        await settle(page);
      }
      if (new URL(page.url()).pathname === "/login") break;

      const file = path.join(SHOTS_DIR, deviceDir, `settings-${tab}.png`);
      await page.screenshot({ path: file, fullPage: true, animations: "disabled" });

      const overflowIssues = await measureOverflows(page);
      recordOverflowHits(deviceLabel, route, overflowIssues, cardOverflows);
      console.log(`✓ ${deviceLabel} ${route} -> ${path.relative(process.cwd(), file)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ device: deviceLabel, route, message });
      console.error(`✗ ${deviceLabel} ${route}: ${message}`);
    }
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

        const overflowIssues = await measureOverflows(page);
        recordOverflowHits(device.label, route, overflowIssues, cardOverflows);

        const status = response?.status() ?? "no response";
        console.log(`✓ ${device.label} ${route} (${status}) -> ${path.relative(process.cwd(), file)}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ device: device.label, route, message });
        console.error(`✗ ${device.label} ${route}: ${message}`);
      }
    }

    await captureMenu(page, baseUrl, device.dir, failures, device.label);
    await captureSettingsTabs(page, baseUrl, device.dir, device.label, cardOverflows, failures);
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
    console.log("\nOverflow hits:");
    for (const item of cardOverflows) {
      const overflowPx =
        item.overflowPx ??
        ((item.elementRight ?? 0) - (item.containerRight ?? 0));
      console.log(
        `- ${item.device}, ${item.route}, ${item.selectorPath ?? item.element}, "${item.text ?? ""}", ${Math.round(overflowPx)}px (kind=${item.kind ?? "container"}, container=${item.container ?? "?"})`,
      );
    }
  } else {
    console.log("\nContainer overflow: none detected.");
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
