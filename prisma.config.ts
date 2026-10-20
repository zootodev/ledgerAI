import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations and CLI commands need a session or direct connection, so
    // prefer DIRECT_URL. The app runtime uses DATABASE_URL (the transaction
    // pooler) and never reads this config. Use process.env directly (not the
    // env() helper) so commands like `prisma generate` / typecheck work even
    // before the variables are configured; live DB operations require one.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
