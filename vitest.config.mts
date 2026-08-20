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
      // Better Auth 1.7 leaks a dangling rejected APIError for every failed
      // email sign-in (the request itself is answered correctly with 401).
      // Ignore exactly that error so the suite still fails on any other
      // unhandled rejection. Tracked in
      // https://github.com/andersro93/snarvei/issues/47 — remove once fixed.
      onUnhandledError(error) {
        const body = (error as { body?: { code?: string } }).body;
        if (body?.code === "INVALID_EMAIL_OR_PASSWORD") {
          return false;
        }
      },
    },
  };
});
