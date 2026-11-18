#!/usr/bin/env node
/**
 * Production dependency audit with a temporary allowlist.
 * Reads npm v7+ audit JSON (the "vulnerabilities" object).
 * Fails on any high/critical advisory not in ALLOWLIST.
 * Temp test: remove GHSA-FC5Q-39XC-VJPF from ALLOWLIST to verify failure.
 */
import { spawnSync } from "node:child_process";

const ALLOWLIST = new Set([
  // picomatch ReDoS, no upstream patch as of 2026-11-18, build-time only (via @sentry/nextjs). Remove once fixed.
  "GHSA-FC5Q-39XC-VJPF",
]);

const run = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});

let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error("Audit check failed: could not parse npm audit output.");
  process.exit(1);
}

// npm 7+ format: report.vulnerabilities is an object keyed by package name
const vulnsByPkg = report.vulnerabilities;
if (!vulnsByPkg || typeof vulnsByPkg !== "object") {
  console.error("Audit check failed: no vulnerabilities object in npm audit output.");
  process.exit(1);
}

const blocking = [];

for (const [pkg, info] of Object.entries(vulnsByPkg)) {
  const entries = info.via ?? [];
  for (const v of entries) {
    const severity = String(v.severity ?? "").toLowerCase();
    if (severity !== "high" && severity !== "critical") continue;

    // Extract GHSA ID from the url
    const url = v.url ?? "";
    const ghsaMatch = url.match(/GHSA-[0-9a-z-]+/i);
    if (!ghsaMatch) continue;
    const ghsaId = ghsaMatch[0].toUpperCase();

    if (ALLOWLIST.has(ghsaId)) continue;

    const title = v.title ?? "unknown";
    blocking.push({ severity, pkg, title, ghsaId });
  }
}

if (blocking.length > 0) {
  console.error("Audit check failed: " + blocking.length + " high/critical advisory(ies) not allowlisted:");
  for (const b of blocking) {
    console.error(`  - ${b.severity} ${b.pkg}: ${b.title} (${b.ghsaId})`);
  }
  process.exit(1);
}

const note = "";
console.log("Audit OK: no blocking high/critical advisories" + note);
process.exit(0);