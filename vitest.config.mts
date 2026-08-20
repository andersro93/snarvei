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
      // Better Auth 1.7 leaves a dangling rejected APIError behind whenever an
      // auth endpoint answers with a 4xx (the HTTP response itself is correct).
      // Ignore exactly those (Better Auth APIError with a 4xx statusCode and an
      // error code) so the suite still fails on any other unhandled rejection.
      // Tracked in https://github.com/andersro93/snarvei/issues/47.
      onUnhandledError(error: unknown) {
        const apiError = error as { statusCode?: number; body?: { code?: string } };
        if (typeof apiError.statusCode === "number" && apiError.statusCode < 500 && typeof apiError.body?.code === "string") {
          return false;
        }
      },
    },
  };
});
