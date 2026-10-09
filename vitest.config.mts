import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      // Thresholds are enforced on the deterministic core accounting engine —
      // the code where correctness matters most (blueprint §18).
      include: ["src/lib/finance/**"],
      thresholds: {
        statements: 78,
        branches: 70,
        functions: 82,
        lines: 80,
      },
    },
  },
});
