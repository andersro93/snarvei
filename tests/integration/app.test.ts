import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";
import type { AppBindings } from "../../src/worker/lib/types";

describe("app", () => {
  const app = createApp();
  const testEnv: AppBindings = {
    DB: env.DB,
    AUTH_SECRET: "4d9ae7e8767de815a6754b18b6fc8c6127ec4ceb3d8f4d64a577f1e3cf6b4ef2",
    APP_URL: "http://localhost:8787",
    APP_NAME: "Snarvei",
  };

  const request = (input: string) =>
    app.request(input, undefined, testEnv);

  beforeAll(async () => {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        target_url TEXT NOT NULL,
        redirect_status INTEGER NOT NULL DEFAULT 302,
        is_active INTEGER NOT NULL DEFAULT 1,
        title TEXT,
        description TEXT,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `).run();
  });

  it("serves a health endpoint", async () => {
    const response = await request("http://localhost/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "snarvei" });
  });

  it("serves scalar docs page", async () => {
    const response = await request("http://localhost/scalar");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Snarvei API Reference");
    expect(html).toContain("/openapi.json");
  });

  it("returns 404 for an unknown slug", async () => {
    const response = await request("http://localhost/l/does-not-exist");
    expect(response.status).toBe(404);
  });
});
