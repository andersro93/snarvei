import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/worker/db/schema.ts",
  out: "./src/worker/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/snarvei.sqlite",
  },
});
