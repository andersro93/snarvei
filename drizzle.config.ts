import { defineConfig } from "drizzle-kit";

// `pnpm db:generate` / `db:check` only need the schema and migrations folder.
// For `drizzle-kit studio` against the local D1, point D1_LOCAL_SQLITE at the
// file under .wrangler/state/v3/d1/miniflare-D1DatabaseObject/ (hashed name).
export default defineConfig({
  schema: "./src/worker/db/schema.ts",
  out: "./src/worker/db/migrations",
  dialect: "sqlite",
  ...(process.env.D1_LOCAL_SQLITE ? { dbCredentials: { url: process.env.D1_LOCAL_SQLITE } } : {}),
});
