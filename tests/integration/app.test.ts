import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";
import type { AppBindings } from "../../src/worker/lib/types";

type StoredObject = {
  body: ArrayBuffer;
  contentType?: string;
  cacheControl?: string;
};

const createMockBucket = () => {
  const objects = new Map<string, StoredObject>();

  return {
    async put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) {
      objects.set(key, {
        body: value,
        contentType: options?.httpMetadata?.contentType,
        cacheControl: options?.httpMetadata?.cacheControl,
      });
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) {
        return null;
      }

      return {
        body: object.body,
        httpEtag: `etag-${key}`,
        writeHttpMetadata(headers: Headers) {
          if (object.contentType) {
            headers.set("content-type", object.contentType);
          }
          if (object.cacheControl) {
            headers.set("cache-control", object.cacheControl);
          }
        },
      };
    },
    async delete(key: string) {
      objects.delete(key);
    },
  } as unknown as R2Bucket;
};

describe("app", () => {
  const app = createApp();
  const testEnv: AppBindings = {
    DB: env.DB,
    PROFILE_IMAGES: createMockBucket(),
    AUTH_SECRET: "4d9ae7e8767de815a6754b18b6fc8c6127ec4ceb3d8f4d64a577f1e3cf6b4ef2",
    APP_URL: "http://localhost:8787",
    APP_NAME: "Snarvei",
  };

  const request = (input: string | Request, init?: RequestInit) =>
    app.request(input, init, testEnv);

  beforeAll(async () => {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        two_factor_enabled INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
    `).run();
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        ip_address TEXT,
        user_agent TEXT,
        user_id TEXT NOT NULL,
        active_organization_id TEXT,
        active_team_id TEXT
      );
    `).run();
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        id_token TEXT,
        access_token_expires_at INTEGER,
        refresh_token_expires_at INTEGER,
        scope TEXT,
        password TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
    `).run();
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS verifications (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
    `).run();
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

  it("rejects profile image upload without a session", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([137, 80, 78, 71])], "avatar.png", { type: "image/png" }));

    const uploadResponse = await request(new Request("http://localhost/api/me/profile-image", {
      method: "POST",
      body: formData,
    }));

    expect(uploadResponse.status).toBe(401);
  });

  it("serves a stored private profile image from the worker route", async () => {
    const key = `images/profile/test-user/${crypto.randomUUID()}`;
    await testEnv.PROFILE_IMAGES.put(key, new Uint8Array([137, 80, 78, 71]).buffer, {
      httpMetadata: {
        contentType: "image/png",
      },
    });

    const imageResponse = await request(`http://localhost/${key}`);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toBe("image/png");
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
