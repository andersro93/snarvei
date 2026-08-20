import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";
import type { AppBindings } from "../../src/worker/lib/types";

const validEnv: AppBindings = {
  DB: env.DB,
  PROFILE_IMAGES: {} as R2Bucket,
  AUTH_SECRET: "6b2bb1c1f08b4dcb8edc6fe6d64ed7135ecfa4012d3224d4203f3a1c4a2727b1",
  APP_URL: "http://localhost:8787",
  APP_NAME: "Snarvei",
};

const app = createApp();

describe("runtime configuration validation", () => {
  const misconfigurations: Array<[string, Partial<AppBindings>]> = [
    ["AUTH_SECRET missing", { AUTH_SECRET: undefined as unknown as string }],
    ["AUTH_SECRET too short", { AUTH_SECRET: "short" }],
    ["APP_URL missing", { APP_URL: undefined }],
    ["APP_URL not a URL", { APP_URL: "not-a-url" }],
    ["DB binding missing", { DB: undefined as unknown as D1Database }],
  ];

  for (const [name, overrides] of misconfigurations) {
    it(`fails closed with a 500 when ${name}`, async () => {
      const broken = { ...validEnv, ...overrides } as AppBindings;
      for (const path of ["/api/me", "/l/some-slug", "/api/health"]) {
        const response = await app.request(`http://localhost${path}`, undefined, broken);
        expect(response.status, path).toBe(500);
        expect(await response.json(), path).toEqual({ error: "Server misconfigured" });
      }
    });
  }

  it("serves requests normally when the configuration is valid", async () => {
    const response = await app.request("http://localhost/api/health", undefined, validEnv);
    expect(response.status).toBe(200);
  });
});
