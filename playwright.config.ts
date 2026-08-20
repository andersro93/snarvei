import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm db:migrate:local && ./node_modules/.bin/vite --host 127.0.0.1 --port 4173",
    env: {
      ...process.env,
      // The Cloudflare Vite plugin only forwards process.env into the Worker
      // when this flag is set (otherwise only wrangler vars / .dev.vars apply).
      CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
      APP_URL: "http://127.0.0.1:4173",
      APP_NAME: "Snarvei",
      AUTH_SECRET:
        process.env.AUTH_SECRET ??
        "4d9ae7e8767de815a6754b18b6fc8c6127ec4ceb3d8f4d64a577f1e3cf6b4ef2",
    },
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
