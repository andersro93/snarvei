import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";

// Runs once per test file (before the tests) against that file's isolated D1.
// TEST_MIGRATIONS is a test-only binding provided by vitest.config.mts.
const migrations = (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS;
await applyD1Migrations(env.DB, migrations);
