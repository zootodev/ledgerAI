import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Use process.env directly (not the env() helper) so commands like
    // `prisma generate` / typecheck work even before a real DATABASE_URL is
    // configured. Live DB operations require DATABASE_URL to be set.
    url: process.env.DATABASE_URL ?? "",
  },
});
