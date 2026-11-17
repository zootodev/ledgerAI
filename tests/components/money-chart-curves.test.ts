import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const MONEY_CHART_FILES = [
  "src/components/charts/line-chart.tsx",
  "src/components/charts/area-chart.tsx",
];

describe("money chart curves", () => {
  it("defines one shape-preserving curve for money series", () => {
    expect(source("src/components/charts/shared.tsx")).toContain(
      'export const MONEY_CURVE = "monotone" as const;',
    );
  });

  it.each(MONEY_CHART_FILES)("uses that curve in %s", (file) => {
    const code = source(file);
    expect(code).toContain("type={MONEY_CURVE}");
    expect(code).not.toMatch(/type=["'](?:natural|basis|catmullRom|linear)["']/);
  });
});
