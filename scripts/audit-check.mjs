#!/usr/bin/env node
/**
 * Temporary audit allowlist script.
 * Runs `npm audit --omit=dev --json`, ignores GHSA-fc5q-39xc-vjpf (picomatch ReDoS,
 * no upstream patch as of 2026-11-18, build-time only) until a real fix is available.
 */

import { execSync } from "child_process";

// --- Allowlist ---
const ALLOWLIST = [
  "GHSA-fc5q-39xc-vjpf", // picomatch ReDoS, no upstream patch as of 2026-11-18, build-time only, remove once fixed
];

// --- Run audit ---
let stdout, stderr;
try {
  stdout = execSync("npm audit --omit=dev --json", { encoding: "utf8" });
} catch (e) {
  stdout = e.stdout || "";
  stderr = e.stderr || "";
}

// Parse JSON output (npm audit --json outputs a JSON object on success, or error data)
let auditData;
try {
  auditData = JSON.parse(stdout);
} catch {
  console.error("❌ Failed to parse npm audit JSON output");
  console.error("stdout:", stdout.substring(0, 500));
  console.error("stderr:", stderr.substring(0, 500));
  process.exit(1);
}

// Collect high/critical vulnerabilities
const vulnerabilities = auditData.advisories || [];
const highCritical = [];

for (const [id, details] of Object.entries(vulnerabilities)) {
  const severity = (details.severity || "").toLowerCase();
  if (severity === "high" || severity === "critical") {
    highCritical.push({ id, ...details });
  }
}

// Check each high/critical advisory against allowlist
let failed = false;
for (const vuln of highCritical) {
  const advisoryId = vuln.id;
  if (ALLOWLIST.includes(advisoryId)) {
    // allowlisted — skip
    continue;
  }
  // Not allowlisted — fail
  failed = true;
  console.error(`❌ High/Critical advisory not allowlisted: ${advisoryId}`);
  console.error(`   URL: ${vuln.url || "unknown"}`);
}

// Report result
if (failed) {
  process.exit(1);
} else {
  console.log(`✅ OK — all high/critical advisories allowlisted (${ALLOWLIST.length} entry${ALLOWLIST.length > 1 ? "s" : ""})`);
  process.exit(0);
}