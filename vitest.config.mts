import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  // Apply the real D1 migrations to the isolated test database instead of
  // maintaining a hand-written copy of the schema in the tests.
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "src/worker/db/migrations"));

  return {
    plugins: [
      cloudflareTest({
        wrangler: {
          configPath: "./wrangler.jsonc",
        },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
      setupFiles: ["./tests/integration/support/apply-migrations.ts"],
      pool: "@cloudflare/vitest-pool-workers",
    },
  };
});
