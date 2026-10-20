/**
 * Dev-only: open a headed browser so you can sign in once, then save the
 * session (cookies + localStorage) to .auth/state.json (gitignored).
 *
 * Usage:
 *   npm run shots:auth                         # production URL
 *   BASE_URL=http://localhost:3000 npm run shots:auth
 *
 * mobile-shots.ts automatically reuses .auth/state.json when it exists.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const DEFAULT_BASE_URL = "https://ledgerai-zootodev.vercel.app";
const AUTH_STATE_PATH = path.resolve(process.cwd(), ".auth/state.json");

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(process.env.BASE_URL ?? DEFAULT_BASE_URL);
  await mkdir(path.dirname(AUTH_STATE_PATH), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log(`Opening ${baseUrl}/login`);
    console.log("Sign in in the browser window. Leave it open when you are done.");
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });

    await rl.question("\nPress Enter here once you are signed in... ");

    const cookies = await context.cookies();
    const hasSession = cookies.some((cookie) => cookie.name.startsWith("sb-"));
    if (!hasSession) {
      console.error(
        "\nNo Supabase session cookie found. Finish signing in, then run this again. Nothing was saved.",
      );
      process.exitCode = 1;
      return;
    }

    await context.storageState({ path: AUTH_STATE_PATH });
    console.log(`\nSaved auth state to ${path.relative(process.cwd(), AUTH_STATE_PATH)}`);
    console.log("You can close the browser window now.");
  } finally {
    rl.close();
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
