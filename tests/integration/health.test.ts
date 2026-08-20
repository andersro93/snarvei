import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/worker/app";
import type { AppBindings } from "../../src/worker/lib/types";
import { ORIGIN, request, testEnv } from "./support/api";

const app = createApp();

describe("GET /api/health", () => {
  it("reports ok with service, version and a database check when everything works", async () => {
    const response = await request(`${ORIGIN}/api/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { ok: boolean; service: string; version: string; checks: { database: string } };
    expect(body).toMatchObject({ ok: true, service: "snarvei", checks: { database: "ok" } });
    expect(typeof body.version).toBe("string");
  });

  it("echoes APP_VERSION when configured", async () => {
    const response = await app.request(`${ORIGIN}/api/health`, undefined, { ...testEnv, APP_VERSION: "abc1234" } as AppBindings);
    expect(((await response.json()) as { version: string }).version).toBe("abc1234");
  });

  it("returns 503 with ok:false when the database is unreachable", async () => {
    const brokenDb = {
      prepare: () => ({
        first: async () => {
          throw new Error("D1 is down");
        },
        all: async () => {
          throw new Error("D1 is down");
        },
        run: async () => {
          throw new Error("D1 is down");
        },
        bind() {
          return this;
        },
      }),
    } as unknown as D1Database;
    const response = await app.request(`${ORIGIN}/api/health`, undefined, { ...testEnv, DB: brokenDb });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { ok: boolean; checks: { database: string } };
    expect(body.ok).toBe(false);
    expect(body.checks.database).toMatch(/error/);
    void env;
  });
});
